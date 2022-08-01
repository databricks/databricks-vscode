import {
    ApiClient,
    Cluster,
    fromConfigFile,
    ScimService,
} from "@databricks/databricks-sdk";
import {
    commands,
    EventEmitter,
    Uri,
    window,
    workspace as vscodeWorkspace,
} from "vscode";
import {CliWrapper} from "../cli/CliWrapper";
import {PathMapper} from "./PathMapper";
import {ProjectConfigFile} from "./ProjectConfigFile";
import {selectProfile} from "./selectProfileWizard";

export type ConnectionState = "CONNECTED" | "CONNECTING" | "DISCONNECTED";

/**
 * The ConnectionManager maintains the connection state to Databricks
 *
 * It's responsible for reading and validating the project configuration
 * and for providing instances of the APIClient, Cluster and Workspace classes
 */
export class ConnectionManager {
    private _state: ConnectionState = "DISCONNECTED";
    private _cluster?: Cluster;
    private _apiClient?: ApiClient;
    private _pathMapper?: PathMapper;
    private _projectConfigFile?: ProjectConfigFile;
    private _me?: string;
    private _profile?: string;

    private readonly onChangeStateEmitter: EventEmitter<ConnectionState> =
        new EventEmitter();
    private readonly onChangeClusterEmitter: EventEmitter<Cluster | undefined> =
        new EventEmitter();

    public readonly onChangeState = this.onChangeStateEmitter.event;
    public readonly onChangeCluster = this.onChangeClusterEmitter.event;

    constructor(private cli: CliWrapper) {}

    get me(): string | undefined {
        return this._me;
    }

    get profile(): string | undefined {
        return this._profile;
    }

    get state(): ConnectionState {
        return this._state;
    }

    get pathMapper(): PathMapper | undefined {
        return this._pathMapper;
    }

    /**
     * Get a pre-configured APIClient. Do not hold on to references to this class as
     * it might be invalidated as the configuration changes. If you have to store a reference
     * make sure to listen to the onChangeCluster event and update as appropriate.
     */
    get apiClient(): ApiClient | undefined {
        return this._apiClient;
    }

    async login(interactive: boolean = false): Promise<void> {
        await this.logout();

        let projectConfigFile;
        let apiClient;
        let profile;

        try {
            if (!vscodeWorkspace.rootPath) {
                throw new Error(
                    "Can't login to Databricks: Not in a VSCode workspace"
                );
            }

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

            apiClient = new ApiClient(credentialProvider);
            this._me = await this.getMe(apiClient);
        } catch (e: any) {
            const message = `Can't login to Databricks: ${e.message}`;
            console.error(message);
            if (interactive) {
                window.showErrorMessage(message);
            }

            await this.logout();
            return;
        }

        this._apiClient = apiClient;
        this._projectConfigFile = projectConfigFile;
        this._profile = profile;
        this.updateState("CONNECTED");

        if (projectConfigFile.config.clusterId) {
            await this.attachCluster(projectConfigFile.config.clusterId);
        }

        if (projectConfigFile.config.workspacePath) {
            await this.attachWorkspace(
                Uri.file(projectConfigFile.config.workspacePath)
            );
        }
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
        this._cluster = undefined;
        this.updateState("DISCONNECTED");
    }

    async configureProject() {
        let profile;
        while (true) {
            profile = await selectProfile(this.cli);
            if (!profile) {
                return;
            }

            try {
                await this.getMe(new ApiClient(fromConfigFile(profile)));
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
                        console.log("open file ...");
                        await commands.executeCommand(
                            "databricks.openDatabricksConfigFile"
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
        if (!vscodeWorkspace.rootPath) {
            throw new Error("Not in a VSCode workspace");
        }

        let projectConfigFile;
        try {
            projectConfigFile = await ProjectConfigFile.load(
                vscodeWorkspace.rootPath
            );
        } catch (e) {
            projectConfigFile = new ProjectConfigFile(
                {},
                vscodeWorkspace.rootPath
            );
        }

        projectConfigFile.profile = profile;
        await projectConfigFile.write();
    }

    get cluster(): Cluster | undefined {
        if (this.state === "DISCONNECTED") {
            return;
        }

        return this._cluster;
    }

    async attachCluster(cluster: Cluster | string): Promise<void> {
        if (this._cluster === cluster) {
            return;
        }

        if (this.state !== "CONNECTED") {
            throw new Error("Can't attach to cluster while not connected.");
        }

        if (typeof cluster === "string") {
            cluster = await Cluster.fromClusterId(this._apiClient!, cluster);
        }

        this._projectConfigFile!.clusterId = cluster.id;
        await this._projectConfigFile!.write();

        this.updateCluster(cluster);
    }

    async detachCluster(): Promise<void> {
        if (!this._cluster) {
            return;
        }

        if (this._projectConfigFile) {
            this._projectConfigFile.clusterId = undefined;
            await this._projectConfigFile.write();
        }

        this.updateCluster(undefined);
    }

    async attachWorkspace(workspacePath: Uri): Promise<void> {
        if (
            !vscodeWorkspace.workspaceFolders ||
            !vscodeWorkspace.workspaceFolders.length
        ) {
            // TODO how do we handle this?
            return;
        }

        const wsUri = vscodeWorkspace.workspaceFolders[0].uri;
        this._pathMapper = new PathMapper(workspacePath, wsUri);
    }

    private async getMe(apiClient: ApiClient): Promise<string> {
        let scimApi = new ScimService(apiClient);
        let response = await scimApi.me({});

        return response.userName;
    }

    private updateState(newState: ConnectionState) {
        console.log("change state", this._state, newState);
        if (this._state !== newState) {
            this._state = newState;
            this.onChangeStateEmitter.fire(this._state);
        }
    }

    private updateCluster(newCluster: Cluster | undefined) {
        if (this._cluster !== newCluster) {
            this._cluster = newCluster;
            this.onChangeClusterEmitter.fire(this._cluster);
        }
    }

    private async waitForConnect() {
        if (this._state === "CONNECTED") {
            return;
        } else if (this._state === "CONNECTING") {
            return await new Promise((resolve) => {
                const changeListener = this.onChangeState(() => {
                    changeListener.dispose();
                    resolve(resolve);
                }, this);
            });
        }
    }
}
