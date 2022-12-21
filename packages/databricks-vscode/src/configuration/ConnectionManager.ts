import {
    ApiClient,
    Cluster,
    WorkspaceService,
    HttpError,
} from "@databricks/databricks-sdk";
import {
    env,
    EventEmitter,
    Uri,
    window,
    workspace as vscodeWorkspace,
} from "vscode";
import {CliWrapper} from "../cli/CliWrapper";
import {SyncDestination} from "./SyncDestination";
import {ProjectConfig, ProjectConfigFile} from "./ProjectConfigFile";
import {configureWorkspaceWizard} from "./configureWorkspaceWizard";
import {ClusterManager} from "../cluster/ClusterManager";
import {workspace} from "@databricks/databricks-sdk";
import {DatabricksWorkspace} from "./DatabricksWorkspace";
import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import {Loggers} from "../logger";
import {AuthProvider} from "./AuthProvider";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const extensionVersion = require("../../package.json").version;

export type ConnectionState = "CONNECTED" | "CONNECTING" | "DISCONNECTED";

/**
 * The ConnectionManager maintains the connection state to Databricks
 *
 * It's responsible for reading and validating the project configuration
 * and for providing instances of the APIClient, Cluster and Workspace classes
 */
export class ConnectionManager {
    private _state: ConnectionState = "DISCONNECTED";
    private _apiClient?: ApiClient;
    private _syncDestination?: SyncDestination;
    private _projectConfigFile?: ProjectConfigFile;
    private _clusterManager?: ClusterManager;
    private _repoRootDetails?: workspace.ObjectInfo;
    private _databricksWorkspace?: DatabricksWorkspace;

    private readonly onDidChangeStateEmitter: EventEmitter<ConnectionState> =
        new EventEmitter();
    private readonly onDidChangeClusterEmitter: EventEmitter<
        Cluster | undefined
    > = new EventEmitter();
    private readonly onDidChangeSyncDestinationEmitter: EventEmitter<
        SyncDestination | undefined
    > = new EventEmitter();

    public readonly onDidChangeState = this.onDidChangeStateEmitter.event;
    public readonly onDidChangeCluster = this.onDidChangeClusterEmitter.event;
    public readonly onDidChangeSyncDestination =
        this.onDidChangeSyncDestinationEmitter.event;

    constructor(private cli: CliWrapper) {}

    get state(): ConnectionState {
        return this._state;
    }

    get cluster(): Cluster | undefined {
        if (this.state !== "CONNECTED") {
            return;
        }

        return this._clusterManager?.cluster;
    }

    get syncDestination(): SyncDestination | undefined {
        return this._syncDestination;
    }

    get repoRootId() {
        return this._repoRootDetails?.object_id;
    }
    get databricksWorkspace(): DatabricksWorkspace | undefined {
        return this._databricksWorkspace;
    }

    /**
     * Get a pre-configured APIClient. Do not hold on to references to this class as
     * it might be invalidated as the configuration changes. If you have to store a reference
     * make sure to listen to the onChangeCluster event and update as appropriate.
     */
    get apiClient(): ApiClient | undefined {
        return this._apiClient;
    }

    public static apiClientFrom(authProvider: AuthProvider): ApiClient {
        return new ApiClient({
            extraUserAgent: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "vscode-extension": extensionVersion,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "auth-type": authProvider.authType,
            },
            credentialProvider: authProvider.getCredentialProvider(),
        });
    }

    async login(interactive = false): Promise<void> {
        try {
            await this._login(interactive);
        } catch (e) {
            NamedLogger.getOrCreate("Extension").error("Login Error", e);
            if (interactive) {
                window.showErrorMessage(`Login error ${JSON.stringify(e)}`);
            }
            this.updateState("DISCONNECTED");
            await this.logout();
        }
    }
    private async _login(interactive = false): Promise<void> {
        await this.logout();
        this.updateState("CONNECTING");

        let projectConfigFile;
        let apiClient;

        try {
            projectConfigFile = await ProjectConfigFile.load(
                vscodeWorkspace.rootPath
            );

            if (!(await projectConfigFile.authProvider.check(true))) {
                throw new Error(
                    `Can't login with ${projectConfigFile.authProvider.describe()}.`
                );
            }

            await projectConfigFile.authProvider.getCredentialProvider();

            apiClient = ConnectionManager.apiClientFrom(
                projectConfigFile.authProvider
            );
            this._databricksWorkspace = await DatabricksWorkspace.load(
                apiClient,
                projectConfigFile.authProvider
            );
        } catch (e: any) {
            const message = `Can't login to Databricks: ${e.message}`;
            NamedLogger.getOrCreate("Extension").error(message, e);
            if (interactive) {
                window.showErrorMessage(message);
            }

            this.updateState("DISCONNECTED");
            await this.logout();
            return;
        }

        if (
            !this._databricksWorkspace.isReposEnabled ||
            !this._databricksWorkspace.isFilesInReposEnabled
        ) {
            let message = "";
            if (!this._databricksWorkspace.isReposEnabled) {
                message =
                    "Repos are not enabled for this workspace. Please enable it in the Databricks UI.";
            } else if (!this._databricksWorkspace.isFilesInReposEnabled) {
                message =
                    "Files in Repos is not enabled for this workspace. Please enable it in the Databricks UI.";
            }
            NamedLogger.getOrCreate("Extension").error(message);
            if (interactive) {
                const result = await window.showWarningMessage(
                    message,
                    "Open Databricks UI"
                );
                if (result === "Open Databricks UI") {
                    const host = await apiClient.host;
                    await env.openExternal(
                        Uri.parse(
                            host.toString() +
                                "#setting/accounts/workspace-settings"
                        )
                    );
                }
            }
        }

        this._apiClient = apiClient;
        this._projectConfigFile = projectConfigFile;

        if (projectConfigFile.clusterId) {
            await this.attachCluster(projectConfigFile.clusterId, true);
        } else {
            this.updateCluster(undefined);
        }

        if (projectConfigFile.workspacePath) {
            await this.attachSyncDestination(
                SyncDestination.normalizeWorkspacePath(
                    projectConfigFile.workspacePath
                ),
                true
            );
        } else {
            this.updateSyncDestination(undefined);
        }

        try {
            this._repoRootDetails = await new WorkspaceService(
                apiClient
            ).getStatus({
                path: `/Repos/${this.databricksWorkspace?.userName}`,
            });
        } catch (e) {
            if (!(e instanceof HttpError && e.code === 404)) {
                throw e;
            }
        }

        this.updateState("CONNECTED");
    }

    async logout() {
        if (this._state === "DISCONNECTED") {
            return;
        } else {
            await this.waitForConnect();
        }

        this._projectConfigFile = undefined;
        this._apiClient = undefined;
        this._repoRootDetails = undefined;
        this._databricksWorkspace = undefined;
        this.updateCluster(undefined);
        this.updateSyncDestination(undefined);
        this.updateState("DISCONNECTED");
    }

    async configureWorkspace() {
        let config: ProjectConfig | undefined;
        while (true) {
            config = await configureWorkspaceWizard(
                this.databricksWorkspace?.host?.toString() ||
                    config?.authProvider?.host.toString() ||
                    process.env.DATABRICKS_HOST
            );

            if (!config) {
                return;
            }

            if (!(await config.authProvider.check(false))) {
                return;
            }

            try {
                await DatabricksWorkspace.load(
                    ConnectionManager.apiClientFrom(config.authProvider),
                    config.authProvider
                );
            } catch (e: any) {
                NamedLogger.getOrCreate("Extension").error(
                    `Connection using "${config.authProvider.describe()}" failed`,
                    e
                );

                const response = await window.showWarningMessage(
                    `Connection using "${config.authProvider.describe()}" failed with error: "${
                        e.message
                    }"."`,
                    "Retry",
                    "Cancel"
                );

                switch (response) {
                    case "Retry":
                        continue;

                    case "Cancel":
                        return;
                }
            }

            break;
        }

        await this.writeConfigFile(config);
        window.showInformationMessage(
            `connected to: ${config.authProvider.host}`
        );

        await this.login(true);
    }

    private async writeConfigFile(config: ProjectConfig) {
        const projectConfigFile = new ProjectConfigFile(
            config,
            vscodeWorkspace.rootPath
        );

        await projectConfigFile.write();
    }

    async attachCluster(
        cluster: Cluster | string,
        skipWrite = false
    ): Promise<void> {
        try {
            if (this.cluster === cluster) {
                return;
            }

            if (typeof cluster === "string") {
                cluster = await Cluster.fromClusterId(
                    this._apiClient!,
                    cluster
                );
            }

            if (!skipWrite) {
                this._projectConfigFile!.clusterId = cluster.id;
                await this._projectConfigFile!.write();
            }

            if (cluster.state === "RUNNING") {
                cluster
                    .canExecute()
                    .then(() => {
                        this.onDidChangeClusterEmitter.fire(this.cluster);
                    })
                    .catch((e) => {
                        NamedLogger.getOrCreate(Loggers.Extension).error(
                            `Error while running code on cluster ${
                                (cluster as Cluster).id
                            }`,
                            e
                        );
                    });
            }

            cluster
                .hasExecutePerms(this.databricksWorkspace?.user)
                .then(() => {
                    this.onDidChangeClusterEmitter.fire(this.cluster);
                })
                .catch((e) => {
                    NamedLogger.getOrCreate(Loggers.Extension).error(
                        `Error while fetching permission for cluster ${
                            (cluster as Cluster).id
                        }`,
                        e
                    );
                });

            this.updateCluster(cluster);
        } catch (e) {
            NamedLogger.getOrCreate("Extension").error(
                "Attach Cluster error",
                e
            );
            window.showErrorMessage(
                `Error in attaching cluster ${
                    typeof cluster === "string" ? cluster : cluster.id
                }`
            );
            await this.detachCluster();
        }
    }

    async detachCluster(): Promise<void> {
        if (!this.cluster && this._projectConfigFile?.clusterId === undefined) {
            return;
        }

        if (this._projectConfigFile) {
            this._projectConfigFile.clusterId = undefined;
            await this._projectConfigFile.write();
        }

        this.updateCluster(undefined);
    }

    async attachSyncDestination(
        workspacePath: Uri,
        skipWrite = false
    ): Promise<void> {
        try {
            if (
                !vscodeWorkspace.workspaceFolders ||
                !vscodeWorkspace.workspaceFolders.length
            ) {
                // TODO how do we handle this?
                return;
            }

            if (!skipWrite) {
                this._projectConfigFile!.workspacePath = workspacePath;
                await this._projectConfigFile!.write();
            }

            const wsUri = vscodeWorkspace.workspaceFolders[0].uri;
            if (this.apiClient === undefined) {
                throw new Error(
                    "Can't attach a Repo when profile is not connected"
                );
            }
            this.updateSyncDestination(
                await SyncDestination.from(this.apiClient, workspacePath, wsUri)
            );
        } catch (e) {
            NamedLogger.getOrCreate("Extension").error(
                "Attach Sync Destination error",
                e
            );
            window.showErrorMessage(
                `Error in attaching sync destination ${workspacePath.fsPath}`
            );
            await this.detachSyncDestination();
        }
    }

    async detachSyncDestination(): Promise<void> {
        if (
            !this._syncDestination &&
            this._projectConfigFile?.workspacePath === undefined
        ) {
            return;
        }

        if (this._projectConfigFile) {
            this._projectConfigFile.workspacePath = undefined;
            await this._projectConfigFile.write();
        }

        this.updateSyncDestination(undefined);
    }

    private updateState(newState: ConnectionState) {
        if (newState === "DISCONNECTED") {
            this._databricksWorkspace = undefined;
        }
        if (this._state !== newState) {
            this._state = newState;
            this.onDidChangeStateEmitter.fire(this._state);
        }
    }

    private updateCluster(newCluster: Cluster | undefined) {
        if (this.cluster !== newCluster) {
            this._clusterManager?.dispose();
            this._clusterManager = newCluster
                ? new ClusterManager(newCluster, () => {
                      this.onDidChangeClusterEmitter.fire(this.cluster);
                  })
                : undefined;
            this.onDidChangeClusterEmitter.fire(this.cluster);
        }
    }

    private updateSyncDestination(
        newSyncDestination: SyncDestination | undefined
    ) {
        if (this._syncDestination !== newSyncDestination) {
            this._syncDestination = newSyncDestination;
            this.onDidChangeSyncDestinationEmitter.fire(this._syncDestination);
        }
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
        if (this._state === "CONNECTED") {
            return;
        } else if (this._state === "CONNECTING") {
            return await new Promise((resolve) => {
                const changeListener = this.onDidChangeState(() => {
                    changeListener.dispose();
                    resolve();
                }, this);
            });
        }
    }
}
