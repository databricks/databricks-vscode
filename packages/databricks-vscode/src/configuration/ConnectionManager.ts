import {WorkspaceClient, ApiClient, logging} from "@databricks/databricks-sdk";
import {Cluster, WorkspaceFsEntity, WorkspaceFsUtils} from "../sdk-extensions";
import {EventEmitter, Uri, window, Disposable} from "vscode";
import {CliWrapper} from "../cli/CliWrapper";
import {
    SyncDestinationMapper,
    RemoteUri,
    LocalUri,
} from "../sync/SyncDestination";
import {configureWorkspaceWizard} from "./configureWorkspaceWizard";
import {ClusterManager} from "../cluster/ClusterManager";
import {DatabricksWorkspace} from "./DatabricksWorkspace";
import {CustomWhenContext} from "../vscode-objs/CustomWhenContext";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {ConfigModel} from "./ConfigModel";
import {onError} from "../utils/onErrorDecorator";
import {AuthProvider} from "./auth/AuthProvider";

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
    private _workspaceClient?: WorkspaceClient;
    private _syncDestinationMapper?: SyncDestinationMapper;
    private _clusterManager?: ClusterManager;
    private _databricksWorkspace?: DatabricksWorkspace;

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

    public metadataServiceUrl?: string;

    private async updateSyncDestinationMapper() {
        const workspacePath = await this.configModel.get("workspaceFsPath");
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
        if (!(await remoteUri.validate(this))) {
            window.showErrorMessage(
                `Invalid sync destination ${workspacePath}`
            );
            this.detachSyncDestination();
            return;
        }
        this._syncDestinationMapper = new SyncDestinationMapper(
            new LocalUri(this.workspaceUri),
            remoteUri
        );
    }

    private async updateClusterManager() {
        const clusterId = await this.configModel.get("clusterId");
        if (clusterId === this._clusterManager?.cluster?.id) {
            return;
        }
        this._clusterManager?.dispose();
        this._clusterManager =
            clusterId !== undefined && this.apiClient !== undefined
                ? new ClusterManager(
                      await Cluster.fromClusterId(this.apiClient, clusterId),
                      () => {
                          this.onDidChangeClusterEmitter.fire(this.cluster);
                      }
                  )
                : undefined;
        this.onDidChangeClusterEmitter.fire(this.cluster);
    }

    constructor(
        private cli: CliWrapper,
        private readonly configModel: ConfigModel,
        private readonly workspaceUri: Uri
    ) {
        this.disposables.push(
            this.configModel.onDidChange(
                "workspaceFsPath",
                this.updateSyncDestinationMapper,
                this
            ),
            this.configModel.onDidChange(
                "clusterId",
                this.updateClusterManager,
                this
            )
            // TODO: React to auth changes ONLY when changes are made to auth parameters in the bundle.
            // If an override is set, then all settings must go through this class, so we don't double login.
        );
    }

    public async init() {
        await this.configModel.init();
        const authParams = await this.configModel.get("authParams");
        if (authParams !== undefined) {
            await this.login(
                AuthProvider.fromJSON(authParams, this.cli.cliPath)
            );
        }
    }

    get state(): ConnectionState {
        return this._state;
    }

    get cluster(): Cluster | undefined {
        if (this.state !== "CONNECTED") {
            return;
        }

        return this._clusterManager?.cluster;
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

    private async login(
        authProvider: AuthProvider,
        force = false
    ): Promise<void> {
        if (force) {
            await this.logout();
        }
        if (this.state !== "DISCONNECTED") {
            return;
        }

        if (!(await authProvider.check())) {
            // We return without any state changes. This ensures that
            // if users move from a working auth type to an invalid
            // auth, the old auth will continue working and they will not
            // have to re authenticate even the old one.
            return;
        }
        try {
            this.updateState("CONNECTING");

            const databricksWorkspace = await DatabricksWorkspace.load(
                authProvider.getWorkspaceClient(),
                authProvider
            );
            this._databricksWorkspace = databricksWorkspace;
            this._workspaceClient = authProvider.getWorkspaceClient();

            await this._databricksWorkspace.optionalEnableFilesInReposPopup(
                this._workspaceClient
            );

            await this.createWsFsRootDirectory(this._workspaceClient);
            await this.updateSyncDestinationMapper();
            await this.updateClusterManager();
            await this.configModel.set("authParams", authProvider.toJSON());

            this.updateState("CONNECTED");
        } catch (e) {
            NamedLogger.getOrCreate("Extension").error(`Login failed`, e);
            if (e instanceof Error) {
                await window.showWarningMessage(
                    `Login failed with error: "${e.message}"."`
                );
            }
            await this.logout();
        }
    }

    async createWsFsRootDirectory(wsClient: WorkspaceClient) {
        if (
            !this.databricksWorkspace ||
            !workspaceConfigs.enableFilesInWorkspace
        ) {
            return;
        }
        const rootDirPath = this.databricksWorkspace.workspaceFsRoot;
        const me = this.databricksWorkspace.userName;
        let rootDir = await WorkspaceFsEntity.fromPath(
            wsClient,
            rootDirPath.path
        );
        if (rootDir) {
            return;
        }
        const meDir = await WorkspaceFsEntity.fromPath(
            wsClient,
            `/Users/${me}`
        );
        if (WorkspaceFsUtils.isDirectory(meDir)) {
            rootDir = await meDir.mkdir(rootDirPath.path);
        }
        if (!rootDir) {
            window.showErrorMessage(`Can't find or create ${rootDirPath.path}`);
            return;
        }
    }

    async logout() {
        if (this._state === "DISCONNECTED") {
            return;
        } else {
            await this.waitForConnect();
        }

        this._workspaceClient = undefined;
        this._databricksWorkspace = undefined;
        await this.updateClusterManager();
        await this.updateSyncDestinationMapper();
        await this.configModel.set("authParams", undefined);
        this.updateState("DISCONNECTED");
    }

    async configureWorkspace() {
        const host = await this.configModel.get("host");
        if (host === undefined) {
            return;
        }

        const config = await configureWorkspaceWizard(this.cli, host);
        if (!config) {
            return;
        }

        await this.login(config.authProvider);
    }

    @onError({
        popup: {prefix: "Can't attach cluster: "},
        log: true,
    })
    async attachCluster(clusterId: string): Promise<void> {
        if (this.cluster?.id === clusterId) {
            return;
        }
        await this.configModel.set("clusterId", clusterId);
    }

    @onError({
        popup: {prefix: "Can't detach cluster: "},
        log: true,
    })
    async detachCluster(): Promise<void> {
        await this.configModel.set("clusterId", undefined);
    }

    @onError({
        popup: {prefix: "Can't attach sync destination: "},
        log: true,
    })
    async attachSyncDestination(remoteWorkspace: RemoteUri): Promise<void> {
        if (!(await remoteWorkspace.validate(this))) {
            await this.detachSyncDestination();
            window.showErrorMessage(
                `Can't attach sync destination ${remoteWorkspace.path}`
            );
            return;
        }
        await this.configModel.set("workspaceFsPath", remoteWorkspace.path);
    }

    @onError({
        popup: {prefix: "Can't detach sync destination: "},
        log: true,
    })
    async detachSyncDestination(): Promise<void> {
        await this.configModel.set("workspaceFsPath", undefined);
    }

    private updateState(newState: ConnectionState) {
        if (newState === "DISCONNECTED") {
            this._databricksWorkspace = undefined;
        }
        if (this._state !== newState) {
            this._state = newState;
            this.onDidChangeStateEmitter.fire(this._state);
        }
        CustomWhenContext.setLoggedIn(this._state === "CONNECTED");
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
