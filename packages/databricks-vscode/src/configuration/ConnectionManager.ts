import {
    WorkspaceClient,
    Cluster,
    WorkspaceFsEntity,
    WorkspaceFsUtils,
} from "@databricks/databricks-sdk";
import {
    env,
    EventEmitter,
    Uri,
    window,
    workspace as vscodeWorkspace,
} from "vscode";
import {CliWrapper} from "../cli/CliWrapper";
import {
    SyncDestinationMapper,
    RemoteUri,
    LocalUri,
} from "../sync/SyncDestination";
import {
    ConfigFileError,
    ProjectConfig,
    ProjectConfigFile,
} from "../file-managers/ProjectConfigFile";
import {configureWorkspaceWizard} from "./configureWorkspaceWizard";
import {ClusterManager} from "../cluster/ClusterManager";
import {DatabricksWorkspace} from "./DatabricksWorkspace";
import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import {Loggers} from "../logger";
import {CustomWhenContext} from "../vscode-objs/CustomWhenContext";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";

export type ConnectionState = "CONNECTED" | "CONNECTING" | "DISCONNECTED";

/**
 * The ConnectionManager maintains the connection state to Databricks
 *
 * It's responsible for reading and validating the project configuration
 * and for providing instances of the APIClient, Cluster and Workspace classes
 */
export class ConnectionManager {
    private _state: ConnectionState = "DISCONNECTED";
    private _workspaceClient?: WorkspaceClient;
    private _syncDestinationMapper?: SyncDestinationMapper;
    private _projectConfigFile?: ProjectConfigFile;
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

    async login(interactive = false, force = false): Promise<void> {
        try {
            await this._login(interactive, force);
        } catch (e) {
            NamedLogger.getOrCreate("Extension").error("Login Error", e);
            if (interactive) {
                window.showErrorMessage(`Login error ${JSON.stringify(e)}`);
            }
            this.updateState("DISCONNECTED");
            await this.logout();
        }
    }
    private async _login(interactive = false, force = false): Promise<void> {
        if (force) {
            await this.logout();
        }
        if (this.state !== "DISCONNECTED") {
            return;
        }
        this.updateState("CONNECTING");

        let projectConfigFile: ProjectConfigFile;
        let workspaceClient: WorkspaceClient;

        try {
            try {
                projectConfigFile = await ProjectConfigFile.load(
                    vscodeWorkspace.rootPath
                );
            } catch (e) {
                if (
                    e instanceof ConfigFileError &&
                    e.message.startsWith("Project config file does not exist")
                ) {
                    this.updateState("DISCONNECTED");
                    await this.logout();
                    return;
                } else {
                    throw e;
                }
            }

            if (!(await projectConfigFile.authProvider.check(true))) {
                throw new Error(
                    `Can't login with ${projectConfigFile.authProvider.describe()}.`
                );
            }

            workspaceClient =
                projectConfigFile.authProvider.getWorkspaceClient();

            await workspaceClient.config.authenticate({});

            this._databricksWorkspace = await DatabricksWorkspace.load(
                workspaceClient,
                projectConfigFile.authProvider
            );
        } catch (e: any) {
            const message = `Can't login to Databricks: ${e.message}`;
            NamedLogger.getOrCreate("Extension").error(message, e);
            window.showErrorMessage(message);

            this.updateState("DISCONNECTED");
            await this.logout();
            return;
        }

        if (
            workspaceConfigs.syncDestinationType === "repo" &&
            (!this._databricksWorkspace.isReposEnabled ||
                !this._databricksWorkspace.isFilesInReposEnabled)
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
                    const host = await workspaceClient.apiClient.host;
                    await env.openExternal(
                        Uri.parse(
                            host.toString() +
                                "#setting/accounts/workspace-settings"
                        )
                    );
                }
            }
        }

        this._workspaceClient = workspaceClient;
        this._projectConfigFile = projectConfigFile;

        if (projectConfigFile.clusterId) {
            await this.attachCluster(projectConfigFile.clusterId, true);
        } else {
            this.updateCluster(undefined);
        }

        if (projectConfigFile.workspacePath) {
            await this.attachSyncDestination(
                new RemoteUri(projectConfigFile.workspacePath),
                true
            );
        } else {
            this.updateSyncDestination(undefined);
        }

        if (
            this.databricksWorkspace &&
            workspaceConfigs.enableFilesInWorkspace
        ) {
            await this.createRootDirectory(
                workspaceClient,
                this.databricksWorkspace.currentFsRoot,
                this.databricksWorkspace.userName
            );
        }

        this.updateState("CONNECTED");
    }

    async createRootDirectory(
        wsClient: WorkspaceClient,
        rootDirPath: RemoteUri,
        me: string
    ) {
        let rootDir = await WorkspaceFsEntity.fromPath(
            wsClient,
            rootDirPath.path
        );
        if (!rootDir) {
            const meDir = await WorkspaceFsEntity.fromPath(
                wsClient,
                `/Users/${me}`
            );
            if (WorkspaceFsUtils.isDirectory(meDir)) {
                rootDir = await meDir.mkdir(rootDirPath.path);
            }
            if (!rootDir) {
                window.showErrorMessage(
                    `Can't find or create ${rootDirPath.path}`
                );
                return;
            }
        }
    }

    async logout() {
        if (this._state === "DISCONNECTED") {
            return;
        } else {
            await this.waitForConnect();
        }

        this._projectConfigFile = undefined;
        this._workspaceClient = undefined;
        this._databricksWorkspace = undefined;
        this.updateCluster(undefined);
        this.updateSyncDestination(undefined);
        this.updateState("DISCONNECTED");
    }

    async configureWorkspace() {
        let config: ProjectConfig | undefined;
        while (true) {
            config = await configureWorkspaceWizard(
                this.cli,
                this.databricksWorkspace?.host?.toString() ||
                    config?.authProvider?.host.toString()
            );

            if (!config) {
                return;
            }

            if (!(await config.authProvider.check(false))) {
                return;
            }

            try {
                const workspaceClient =
                    config.authProvider.getWorkspaceClient();

                await workspaceClient.config.authenticate({});

                await DatabricksWorkspace.load(
                    workspaceClient,
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

        await this.login(true, true);
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
                    this._workspaceClient!.apiClient,
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
        remoteWorkspace: RemoteUri,
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
            if (
                this.workspaceClient === undefined ||
                this.databricksWorkspace === undefined
            ) {
                throw new Error(
                    "Can't attach a Sync Destination when profile is not connected"
                );
            }
            if (!(await remoteWorkspace.validate(this))) {
                await this.detachSyncDestination();
                return;
            }

            if (!skipWrite) {
                this._projectConfigFile!.workspacePath = remoteWorkspace.uri;
                await this._projectConfigFile!.write();
            }

            const wsUri = vscodeWorkspace.workspaceFolders[0].uri;
            this.updateSyncDestination(
                new SyncDestinationMapper(new LocalUri(wsUri), remoteWorkspace)
            );
        } catch (e) {
            NamedLogger.getOrCreate("Extension").error(
                "Attach Sync Destination error",
                e
            );
            window.showErrorMessage(
                `Error in attaching sync destination ${remoteWorkspace.path}`
            );
            await this.detachSyncDestination();
        }
    }

    async detachSyncDestination(): Promise<void> {
        if (
            !this._syncDestinationMapper &&
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
        CustomWhenContext.setLoggedIn(this._state === "CONNECTED");
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
        newSyncDestination: SyncDestinationMapper | undefined
    ) {
        if (this._syncDestinationMapper !== newSyncDestination) {
            this._syncDestinationMapper = newSyncDestination;
            this.onDidChangeSyncDestinationEmitter.fire(
                this._syncDestinationMapper
            );
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
