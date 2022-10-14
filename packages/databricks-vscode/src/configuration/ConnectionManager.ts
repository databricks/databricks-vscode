import {
    ApiClient,
    Cluster,
    fromConfigFile,
    CurrentUserService,
    CredentialProvider,
    WorkspaceConf,
    scim,
} from "@databricks/databricks-sdk";
import {
    env,
    commands,
    EventEmitter,
    Uri,
    window,
    workspace as vscodeWorkspace,
} from "vscode";
import {CliWrapper} from "../cli/CliWrapper";
import {SyncDestination} from "./SyncDestination";
import {ProjectConfigFile} from "./ProjectConfigFile";
import {selectProfile} from "./selectProfileWizard";
import {ClusterManager} from "../cluster/ClusterManager";

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
    private _me?: scim.User;
    private _profile?: string;
    private _clusterManager?: ClusterManager;

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

    get me(): string | undefined {
        return this._me?.userName;
    }

    get meDetails(): scim.User | undefined {
        return this._me;
    }

    get profile(): string | undefined {
        return this._profile;
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

    get syncDestination(): SyncDestination | undefined {
        return this._syncDestination;
    }

    /**
     * Get a pre-configured APIClient. Do not hold on to references to this class as
     * it might be invalidated as the configuration changes. If you have to store a reference
     * make sure to listen to the onChangeCluster event and update as appropriate.
     */
    get apiClient(): ApiClient | undefined {
        return this._apiClient;
    }

    private apiClientFrom(creds: CredentialProvider): ApiClient {
        return new ApiClient("vscode-extension", extensionVersion, creds);
    }

    async login(interactive: boolean = false): Promise<void> {
        await this.logout();
        this.updateState("CONNECTING");

        let projectConfigFile;
        let apiClient;
        let profile;

        try {
            projectConfigFile = await ProjectConfigFile.load(
                vscodeWorkspace.rootPath
            );

            profile = projectConfigFile.config.profile;
            if (!profile) {
                throw new Error(
                    "Can't login to Databricks: Can't find project configuration file"
                );
            }

            let credentialProvider = fromConfigFile(profile);

            await credentialProvider();

            apiClient = this.apiClientFrom(credentialProvider);
            this._me = await this.getMe(apiClient);
        } catch (e: any) {
            const message = `Can't login to Databricks: ${e.message}`;
            console.error(message);
            if (interactive) {
                window.showErrorMessage(message);
            }

            this.updateState("DISCONNECTED");
            await this.logout();
            return;
        }

        this._apiClient = apiClient;
        this._projectConfigFile = projectConfigFile;
        this._profile = profile;

        if (projectConfigFile.config.clusterId) {
            await this.attachCluster(projectConfigFile.config.clusterId, false);
        } else {
            this.updateCluster(undefined);
        }

        if (projectConfigFile.config.workspacePath) {
            await this.attachSyncDestination(
                Uri.from({
                    scheme: "dbws",
                    path: projectConfigFile.config.workspacePath,
                }),
                false
            );
        } else {
            this.updateSyncDestination(undefined);
        }

        this.updateState("CONNECTED");
    }

    async logout() {
        if (this._state === "DISCONNECTED") {
            return;
        } else {
            await this.waitForConnect();
        }

        this._apiClient = undefined;
        this._me = undefined;
        this._projectConfigFile = undefined;
        this.updateCluster(undefined);
        this.updateState("DISCONNECTED");
    }

    async configureProject() {
        let profile: string | undefined;
        while (true) {
            profile = await selectProfile(this.cli);
            if (!profile) {
                return;
            }

            try {
                await this.getMe(this.apiClientFrom(fromConfigFile(profile)));
            } catch (e: any) {
                console.error(e);
                const response = await window.showWarningMessage(
                    `Connection with profile "${profile}" failed with error: "${e.message}"."`,
                    "Retry",
                    "Open configuration file",
                    "Cancel"
                );

                switch (response) {
                    case "Retry":
                        continue;

                    case "Cancel":
                        return;

                    case "Open configuration file":
                        await commands.executeCommand(
                            "databricks.connection.openDatabricksConfigFile"
                        );
                        return;
                }
            }

            break;
        }

        await this.writeConfigFile(profile);
        window.showInformationMessage(`Selected profile: ${profile}`);

        await this.login(false);
    }

    private async writeConfigFile(profile: string) {
        const projectConfigFile = new ProjectConfigFile(
            {},
            vscodeWorkspace.rootPath
        );

        projectConfigFile.profile = profile;

        await projectConfigFile.write();
    }

    async attachCluster(
        cluster: Cluster | string,
        skipWrite = false
    ): Promise<void> {
        if (this.cluster === cluster) {
            return;
        }

        if (typeof cluster === "string") {
            cluster = await Cluster.fromClusterId(this._apiClient!, cluster);
        }

        if (!skipWrite) {
            this._projectConfigFile!.clusterId = cluster.id;
            await this._projectConfigFile!.write();
        }

        this.updateCluster(cluster);
    }

    async detachCluster(): Promise<void> {
        if (!this.cluster) {
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
        if (
            !vscodeWorkspace.workspaceFolders ||
            !vscodeWorkspace.workspaceFolders.length
        ) {
            // TODO how do we handle this?
            return;
        }

        if (!skipWrite) {
            this._projectConfigFile!.workspacePath = workspacePath.path;
            await this._projectConfigFile!.write();
        }

        const wsUri = vscodeWorkspace.workspaceFolders[0].uri;
        this.updateSyncDestination(new SyncDestination(workspacePath, wsUri));
    }

    async detachSyncDestination(): Promise<void> {
        if (!this._syncDestination) {
            return;
        }

        if (this._projectConfigFile) {
            this._projectConfigFile.workspacePath = undefined;
            await this._projectConfigFile.write();
        }

        this.updateSyncDestination(undefined);
    }

    private async getMe(apiClient: ApiClient): Promise<scim.User> {
        let scimApi = new CurrentUserService(apiClient);
        let response = await scimApi.me();

        return response;
    }

    private updateState(newState: ConnectionState) {
        if (this._state !== newState) {
            this._state = newState;
            this.onDidChangeStateEmitter.fire(this._state);
        }
    }

    private updateCluster(newCluster: Cluster | undefined) {
        if (this.cluster !== newCluster) {
            this._clusterManager?.dispose();
            this._clusterManager = newCluster
                ? new ClusterManager(newCluster)
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
        await this._clusterManager?.start((state) => {
            this.onDidChangeClusterEmitter.fire(this.cluster);
        });
    }

    async stopCluster() {
        await this._clusterManager?.stop((state) => {
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
