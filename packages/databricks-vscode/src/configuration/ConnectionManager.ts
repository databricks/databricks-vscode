import {
    ApiClient,
    Cluster,
    fromConfigFile,
    ScimApi,
} from "@databricks/databricks-sdk";
import {commands, Event, EventEmitter, window, workspace} from "vscode";
import {CliWrapper} from "../cli/CliWrapper";
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
    public readonly onChangeState: Event<ConnectionState>;
    public readonly onChangeCluster: Event<Cluster | undefined>;

    private _state: ConnectionState = "DISCONNECTED";
    private _cluster?: Cluster;
    private _apiClient?: ApiClient;
    private _projectConfigFile?: ProjectConfigFile;
    private _me?: string;

    private readonly onChangeStateEmitter: EventEmitter<ConnectionState> =
        new EventEmitter();
    private readonly onChangeClusterEmitter: EventEmitter<Cluster | undefined> =
        new EventEmitter();

    constructor(private cli: CliWrapper) {
        this.onChangeState = this.onChangeStateEmitter.event;
        this.onChangeCluster = this.onChangeClusterEmitter.event;
    }

    get me(): string | undefined {
        return this._me;
    }

    get state(): ConnectionState {
        return this._state;
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

        try {
            if (!workspace.rootPath) {
                throw new Error(
                    "Can't login to Databricks: Not in a VSCode workspace"
                );
            }

            projectConfigFile = await ProjectConfigFile.load(
                workspace.rootPath
            );

            if (!projectConfigFile.config.profile) {
                throw new Error(
                    "Can't login to Databricks: Can't find project configuration file"
                );
            }

            let credentialProvider = fromConfigFile(
                projectConfigFile.config.profile
            );

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
        this._cluster = undefined;
        this.updateState("DISCONNECTED");
    }

    async configureProject() {
        if (!workspace.rootPath) {
            throw new Error(
                "Can't login to Databricks: Not in a VSCode workspace"
            );
        }

        let projectConfigFile;
        try {
            projectConfigFile = await ProjectConfigFile.load(
                workspace.rootPath
            );
        } catch (e) {
            projectConfigFile = new ProjectConfigFile({}, workspace.rootPath);
        }

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

        projectConfigFile.profile = profile;
        await projectConfigFile.write();
        window.showInformationMessage(`Selected profile: ${profile}`);

        await this.login(false);
    }

    async getCluster(): Promise<Cluster | undefined> {
        if (this.state === "DISCONNECTED") {
            return;
        }

        if (!this._apiClient) {
            return;
        }

        if (this._cluster) {
            return this._cluster;
        }

        if (!this._projectConfigFile?.config.clusterId) {
            return;
        }

        let cluster;
        try {
            cluster = await Cluster.fromClusterId(
                this._apiClient,
                this._projectConfigFile?.config.clusterId
            );
        } catch (e) {
            return;
        }

        if (!(await cluster.canExecute())) {
            return;
        }

        this.updateCluster(cluster);
        return cluster;
    }

    async getRepo() {}

    private async getMe(apiClient: ApiClient): Promise<string> {
        let scimApi = new ScimApi(apiClient);
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
