import {
    WorkspaceClient,
    ApiClient,
    logging,
    AuthType as SdkAuthType,
} from "@databricks/databricks-sdk";
import {Cluster} from "../sdk-extensions";
import {EventEmitter, window, Disposable} from "vscode";
import {CliWrapper, ProcessError} from "../cli/CliWrapper";
import {
    SyncDestinationMapper,
    RemoteUri,
    LocalUri,
} from "../sync/SyncDestination";
import {LoginWizard, getProfilesForHost} from "./LoginWizard";
import {ClusterManager} from "../cluster/ClusterManager";
import {DatabricksWorkspace} from "./DatabricksWorkspace";
import {CustomWhenContext} from "../vscode-objs/CustomWhenContext";
import {ConfigModel} from "./models/ConfigModel";
import {onError, withOnErrorHandler} from "../utils/onErrorDecorator";
import {AuthProvider, ProfileAuthProvider} from "./auth/AuthProvider";
import {Mutex} from "../locking";
import {MetadataService} from "./auth/MetadataService";
import {Events, Telemetry} from "../telemetry";
import {AutoLoginSource, ManualLoginSource} from "../telemetry/constants";
import {Barrier} from "../locking/Barrier";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {ProjectConfigFile} from "../file-managers/ProjectConfigFile";

// eslint-disable-next-line @typescript-eslint/naming-convention
const {NamedLogger} = logging;
export type ConnectionState = "CONNECTED" | "CONNECTING" | "DISCONNECTED";

/**
 * The ConnectionManager maintains the connection state to Databricks
 *
 * It's responsible for reading and validating the project configuration
 * and for providing instances of the APIClient, Cluster and Workspace classes
 */
export class ConnectionManager implements Disposable {
    private disposables: Disposable[] = [];
    private _state: ConnectionState = "DISCONNECTED";
    private loginLogoutMutex: Mutex = new Mutex();
    private savedAuthMutex: Mutex = new Mutex();
    private configureLoginMutex: Mutex = new Mutex();

    private _workspaceClient?: WorkspaceClient;
    private _syncDestinationMapper?: SyncDestinationMapper;
    private _clusterManager?: ClusterManager;
    private _databricksWorkspace?: DatabricksWorkspace;
    private _metadataService: MetadataService;
    private _serverlessEnabled: boolean = false;

    private readonly onDidChangeStateEmitter: EventEmitter<ConnectionState> =
        new EventEmitter();
    private readonly onDidChangeClusterEmitter: EventEmitter<
        Cluster | undefined
    > = new EventEmitter();
    private readonly onDidChangeSyncDestinationEmitter: EventEmitter<
        SyncDestinationMapper | undefined
    > = new EventEmitter();

    public readonly onDidChangeState = this.onDidChangeStateEmitter.event;
    public readonly onDidChangeCluster = this.onDidChangeClusterEmitter.event;
    public readonly onDidChangeSyncDestination =
        this.onDidChangeSyncDestinationEmitter.event;

    private readonly initialization = new Barrier();

    get projectRoot() {
        return this.workspaceFolderManager.activeProjectUri;
    }

    constructor(
        private cli: CliWrapper,
        private readonly configModel: ConfigModel,
        private readonly workspaceFolderManager: WorkspaceFolderManager,
        private readonly customWhenContext: CustomWhenContext,
        private readonly telemetry: Telemetry
    ) {
        this._metadataService = new MetadataService(
            undefined,
            NamedLogger.getOrCreate("Extension")
        );
    }

    @onError({
        popup: {prefix: "Error attaching sync destination: "},
    })
    private async updateSyncDestinationMapper() {
        const workspacePath = await this.configModel.get("remoteRootPath");
        const remoteUri = workspacePath
            ? new RemoteUri(workspacePath)
            : undefined;
        if (remoteUri?.path === this._syncDestinationMapper?.remoteUri.path) {
            return;
        }
        if (remoteUri === undefined) {
            this._syncDestinationMapper = undefined;
            this.onDidChangeSyncDestinationEmitter.fire(
                this._syncDestinationMapper
            );
            return;
        }
        this._syncDestinationMapper = new SyncDestinationMapper(
            new LocalUri(this.projectRoot),
            remoteUri
        );
    }

    @onError({
        popup: {prefix: "Error attaching cluster: "},
    })
    private async updateClusterManager() {
        try {
            const clusterId = await this.configModel.get("clusterId");
            if (clusterId === this._clusterManager?.cluster?.id) {
                return;
            }
            this._clusterManager?.dispose();
            this._clusterManager =
                clusterId !== undefined && this.apiClient !== undefined
                    ? new ClusterManager(
                          await Cluster.fromClusterId(
                              this.apiClient,
                              clusterId
                          ),
                          () => {
                              this.onDidChangeClusterEmitter.fire(this.cluster);
                          }
                      )
                    : undefined;

            if (
                (await this.configModel.get("useClusterOverride")) ||
                clusterId === undefined
            ) {
                this.cli.setClusterId(clusterId);
            }
            if (this.cluster) {
                this.telemetry.recordEvent(Events.COMPUTE_SELECTED, {
                    type: "cluster",
                });
            }
            this.onDidChangeClusterEmitter.fire(this.cluster);
        } catch (e) {
            this.configModel.set("clusterId", undefined);
            throw e;
        }
    }

    private async updateServerless() {
        if (this.configModel.target === undefined) {
            return;
        }
        const serverless = await this.configModel.get("serverless");
        const computeId = this.apiClient?.config.serverlessComputeId;
        if (
            serverless ||
            (!this.cluster && serverless === undefined && computeId === "auto")
        ) {
            await this.enableServerless();
        } else {
            await this.disableServerless();
        }
    }

    get metadataServiceUrl() {
        return this._metadataService.url;
    }

    public async init() {
        try {
            await this.loginWithSavedAuth("init");
        } finally {
            this.disposables.push(
                this.configModel.onDidChangeKey("remoteRootPath")(
                    this.updateSyncDestinationMapper.bind(this)
                ),
                this.configModel.onDidChangeKey("clusterId")(
                    this.updateClusterManager.bind(this)
                ),
                this.configModel.onDidChangeKey("serverless")(
                    this.updateServerless.bind(this)
                ),
                this.configModel.onDidChangeKey("useClusterOverride")(
                    async () => {
                        const useClusterOverride =
                            await this.configModel.get("useClusterOverride");
                        this.cli.setClusterId(
                            useClusterOverride
                                ? this._clusterManager?.cluster?.id
                                : undefined
                        );
                    }
                ),
                // Don't just listen to target change for logging in. Also explictly listen for changes in the keys we care about.
                // We don't have to listen to changes in authProfile as it's set by the login method and we don't respect other
                // user changes.
                // TODO: start listening to changes in authParams
                this.configModel.onDidChangeKey("host")(
                    this.loginWithSavedAuth.bind(this, "hostChange")
                ),
                this.configModel.onDidChangeTarget(
                    this.loginWithSavedAuth.bind(this, "targetChange")
                ),
                this.workspaceFolderManager.onDidChangeActiveProjectFolder(
                    withOnErrorHandler(
                        async () => {
                            await this.configModel.setTarget(undefined);
                        },
                        {log: true}
                    )
                )
            );
            this.initialization.resolve();
        }
    }

    get state(): ConnectionState {
        return this._state;
    }

    get cluster(): Cluster | undefined {
        return this._clusterManager?.cluster;
    }

    get serverless(): boolean {
        return this._serverlessEnabled;
    }

    get syncDestinationMapper(): SyncDestinationMapper | undefined {
        return this._syncDestinationMapper;
    }

    get databricksWorkspace(): DatabricksWorkspace | undefined {
        return this._databricksWorkspace;
    }

    /**
     * Get a pre-configured APIClient. Do not hold on to references to this class as
     * it might be invalidated as the configuration changes. If you have to store a reference
     * make sure to listen to the onChangeCluster event and update as appropriate.
     */
    get workspaceClient(): WorkspaceClient | undefined {
        return this._workspaceClient;
    }

    get apiClient(): ApiClient | undefined {
        return this._workspaceClient?.apiClient;
    }

    get authType(): SdkAuthType | undefined {
        return this.apiClient?.config.authType;
    }

    // Only used through public API
    public async login(interactive?: boolean, force?: boolean) {
        await this.initialization.promise;
        if (this.state !== "CONNECTED" || force) {
            await this.configureLogin("api");
        }
    }

    private async loginWithSavedAuth(source: AutoLoginSource) {
        if (this.savedAuthMutex.locked) {
            return;
        }

        await this.savedAuthMutex.synchronise(async () => {
            const recordEvent = this.telemetry.start(Events.AUTO_LOGIN);
            try {
                await this.disconnect();
                const authProvider = await this.resolveAuth();
                if (authProvider) {
                    await this.connect(authProvider);
                } else {
                    await this.logout();
                }
                recordEvent({success: this.state === "CONNECTED", source});
            } catch (e) {
                await this.disconnect();
                recordEvent({success: false, source});
                throw e;
            }
        });
    }

    private async loadLegacyProjectConfig() {
        try {
            return await ProjectConfigFile.loadConfig(this.projectRoot.fsPath);
        } catch (error) {
            const logger = NamedLogger.getOrCreate("Extension");
            logger.error(`Error loading legacy config`, error);
            return undefined;
        }
    }

    @onError({popup: {prefix: "Failed to login."}})
    @Mutex.synchronise("loginLogoutMutex")
    private async resolveAuth() {
        this.updateState("CONNECTING");
        const host = await this.configModel.get("host");
        const target = this.configModel.target;
        if (host === undefined || target === undefined) {
            return;
        }

        // Try to load a profile user had previously selected for this target
        let savedProfile = (await this.configModel.get("overrides"))
            ?.authProfile;
        // Check if the profile is saved in the legacy project.json file
        if (!savedProfile) {
            const legacyConfig = await this.loadLegacyProjectConfig();
            savedProfile = legacyConfig?.profile;
        }
        if (savedProfile !== undefined) {
            const authProvider = await ProfileAuthProvider.from(
                savedProfile,
                this.cli
            );
            if (
                authProvider.host.toString() === host.toString() &&
                (await authProvider.check())
            ) {
                return authProvider;
            }
        }

        // Try to load any parameters that are hard coded in the bundle
        const bundleAuthParams =
            await this.configModel.get("preValidateConfig");
        if (bundleAuthParams?.authParams !== undefined) {
            throw new Error("Bundle auth params not implemented");
        }

        // Try to load a unique profile that matches the host
        const profiles = await getProfilesForHost(host, this.cli);
        if (profiles.length !== 1) {
            return;
        }
        const authProvider = await ProfileAuthProvider.from(
            profiles[0].name,
            this.cli
        );
        if (await authProvider.check()) {
            return authProvider;
        }
    }

    private async connect(authProvider: AuthProvider): Promise<void> {
        try {
            await window.withProgress(
                {
                    location: {viewId: "configurationView"},
                    title: "Connecting to the workspace",
                },
                () => this._connect(authProvider)
            );
        } catch (e) {
            NamedLogger.getOrCreate("Extension").error(
                `Error connecting to the workspace`,
                e
            );
            if (e instanceof ProcessError) {
                e.showErrorMessage("Error connecting to the workspace.");
            } else if (e instanceof Error) {
                window.showErrorMessage(
                    `Error connecting to the workspace: "${e.message}"."`
                );
            }
        }
    }

    @Mutex.synchronise("loginLogoutMutex")
    private async _connect(authProvider: AuthProvider) {
        this.updateState("CONNECTING");
        this._workspaceClient = await authProvider.getWorkspaceClient();
        this._databricksWorkspace = await DatabricksWorkspace.load(
            this._workspaceClient,
            authProvider
        );
        await this.configModel.set(
            "authProfile",
            authProvider.toJSON().profile as string | undefined
        );

        await this.updateSyncDestinationMapper();
        await this.updateClusterManager();
        await this.updateServerless();
        await this._metadataService.setApiClient(this.apiClient);
        try {
            await this.configModel.setAuthProvider(authProvider);
        } finally {
            this.updateState("CONNECTED");
        }
    }

    @Mutex.synchronise("loginLogoutMutex")
    private async disconnect() {
        this._workspaceClient = undefined;
        this._databricksWorkspace = undefined;
        await this.updateClusterManager();
        await this.updateSyncDestinationMapper();
        this.updateState("DISCONNECTED");
    }

    @onError({popup: {prefix: "Can't logout."}})
    async logout() {
        await this.disconnect();
        if (this.configModel.target !== undefined) {
            await Promise.all([
                this.configModel.set("authProfile", undefined),
                this.configModel.setAuthProvider(undefined),
            ]);
        }
    }

    @onError({
        popup: {prefix: "Can't configure workspace. "},
    })
    async configureLogin(source: ManualLoginSource) {
        if (this.configureLoginMutex.locked) {
            window.showErrorMessage(
                "Databricks: sign in is already in progress"
            );
            return;
        }
        await this.configureLoginMutex.synchronise(async () => {
            const recordEvent = this.telemetry.start(Events.MANUAL_LOGIN);
            try {
                const authProvider = await LoginWizard.run(
                    this.cli,
                    this.configModel.target,
                    await this.configModel.get("host")
                );
                if (authProvider) {
                    await this.connect(authProvider);
                }
                recordEvent({success: this.state === "CONNECTED", source});
            } catch (e) {
                recordEvent({success: false, source});
                throw e;
            }
        });
    }

    @onError({
        popup: {prefix: "Can't attach cluster. "},
    })
    async attachCluster(clusterId: string): Promise<void> {
        if (this.cluster?.id === clusterId) {
            return;
        }
        await this.disableServerless();
        await this.configModel.set("clusterId", clusterId);
    }

    @onError({
        popup: {prefix: "Can't detach cluster. "},
    })
    async detachCluster(): Promise<void> {
        await this.configModel.set("clusterId", undefined);
    }

    @onError({
        popup: {prefix: "Failed to enable serverless mode."},
    })
    async enableServerless() {
        if (!this._serverlessEnabled) {
            this._serverlessEnabled = true;
            await this.configModel.set("serverless", true);
            await this.configModel.set("useClusterOverride", false);
            await this.detachCluster();
            this.customWhenContext.setServerless(true);
            this.onDidChangeClusterEmitter.fire(undefined);
            this.telemetry.recordEvent(Events.COMPUTE_SELECTED, {
                type: "serverless",
            });
        }
    }

    @onError({
        popup: {prefix: "Failed to disable serverless mode."},
    })
    async disableServerless() {
        if (this._serverlessEnabled) {
            this._serverlessEnabled = false;
            await this.configModel.set("serverless", false);
            this.customWhenContext.setServerless(false);
            this.onDidChangeClusterEmitter.fire(undefined);
        }
    }

    @onError({
        popup: {prefix: "Can't attach sync destination. "},
    })
    async attachSyncDestination(remoteWorkspace: RemoteUri): Promise<void> {
        if (!(await remoteWorkspace.validate(this))) {
            await this.detachSyncDestination();
            window.showErrorMessage(
                `Can't attach sync destination ${remoteWorkspace.path}`
            );
            return;
        }
        await this.configModel.set("remoteRootPath", remoteWorkspace.path);
        await this.configModel.set("remoteRootPath", remoteWorkspace.path);
    }

    @onError({
        popup: {prefix: "Can't detach sync destination. "},
    })
    async detachSyncDestination(): Promise<void> {
        await this.configModel.set("remoteRootPath", undefined);
    }

    private updateState(newState: ConnectionState) {
        if (!this.loginLogoutMutex.locked) {
            throw new Error(
                "updateState must be called after aquireing the state mutex"
            );
        }
        if (this._state !== newState) {
            this._state = newState;
            this.onDidChangeStateEmitter.fire(this._state);
        }
        this.customWhenContext.setLoggedIn(this._state === "CONNECTED");
    }

    async startCluster() {
        await this._clusterManager?.start(() => {
            this.onDidChangeClusterEmitter.fire(this.cluster);
        });
    }

    async stopCluster() {
        await this._clusterManager?.stop(() => {
            this.onDidChangeClusterEmitter.fire(this.cluster);
        });
    }

    async startMetadataService() {
        await this._metadataService.listen();
        return this._metadataService;
    }

    async waitForConnect(): Promise<void> {
        if (this._state !== "CONNECTED") {
            return await new Promise((resolve) => {
                const changeListener = this.onDidChangeState((e) => {
                    if (e === "CONNECTED") {
                        changeListener.dispose();
                        resolve();
                    }
                }, this);
            });
        }
    }

    async dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
