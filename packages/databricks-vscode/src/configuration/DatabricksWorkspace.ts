import {WorkspaceClient, iam, logging} from "@databricks/databricks-sdk";
import {Cluster, WorkspaceConf, WorkspaceConfProps} from "../sdk-extensions";
import {context, Context} from "@databricks/databricks-sdk";
import {Uri} from "vscode";
import {Loggers} from "../logger";
import {AuthProvider} from "./auth/AuthProvider";
import {RemoteUri} from "../sync/SyncDestination";

type ServerlessEnablementResponse = {
    setting?: {
        value?: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            serverless_jobs_notebooks_workspace_enable_val?: {
                value: string;
            };
        };
    };
};

export class DatabricksWorkspace {
    constructor(
        public readonly id: string,
        private _authProvider: AuthProvider,
        private me: iam.User,
        private wsConf: WorkspaceConfProps & {enableServerless?: boolean}
    ) {}

    /**
     * The current root for sync destination folders.
     */
    get currentFsRoot(): RemoteUri {
        return this.workspaceFsRoot;
    }

    get workspaceFsRoot(): RemoteUri {
        return new RemoteUri(
            Uri.from({scheme: "wsfs", path: `/Users/${this.userName}/.ide`})
        );
    }

    get repoRoot(): RemoteUri {
        return new RemoteUri(
            Uri.from({scheme: "wsfs", path: `/Repos/${this.userName}`})
        );
    }

    get host(): URL {
        return this._authProvider.host;
    }

    get authProvider(): AuthProvider {
        return this._authProvider;
    }

    get userName(): string {
        return this.me.userName || "";
    }

    get user(): iam.User {
        return this.me;
    }

    get isReposEnabled(): boolean {
        return this.wsConf.enableProjectTypeInWorkspace !== "false";
    }

    get isFilesInReposEnabled(): boolean {
        return this.wsConf.enableWorkspaceFilesystem !== "false";
    }

    get isServerlessEnabled(): boolean {
        return this.wsConf.enableServerless === true;
    }

    supportFilesInReposForCluster(cluster: Cluster): boolean {
        if (!this.isReposEnabled || !this.isFilesInReposEnabled) {
            return false;
        }
        const dbr = cluster.dbrVersion;
        switch (this.wsConf.enableWorkspaceFilesystem) {
            case "dbr11.0+":
                return dbr[0] === "x" || dbr[0] >= 11;

            case "dbr8.4+":
                return (
                    dbr[0] === "x" ||
                    (dbr[0] === 8 && (dbr[1] === "x" || dbr[1] >= 4)) ||
                    dbr[0] > 8
                );

            case "false":
                return false;

            case "true":
                return true;

            default:
                return true;
        }
    }

    @logging.withLogContext(Loggers.Extension, "DatabricksWorkspace.load")
    static async load(
        client: WorkspaceClient,
        authProvider: AuthProvider,
        @context ctx?: Context
    ) {
        const me = await client.currentUser.me(ctx);
        // Workspace ID is returned in a header, which is then copied to the response object.
        const id = (me as any)["x-databricks-org-id"] as string;

        const wsConfApi = new WorkspaceConf(client.apiClient);
        let state: WorkspaceConfProps & {enableServerless?: boolean} = {
            enableProjectTypeInWorkspace: "true",
            enableWorkspaceFilesystem: "true",
        };
        try {
            const confStatus = await wsConfApi.getStatus(
                ["enableProjectTypeInWorkspace", "enableWorkspaceFilesystem"],
                ctx
            );
            state = {...state, ...confStatus};
        } catch (e) {
            ctx?.logger?.error("Can't fetch workspace confs", e);
        }
        try {
            const serverlessEnablement = (await client.apiClient.request(
                `/api/2.0/settings-api/workspace/${id}/serverless_jobs_ws_nb_enable`,
                "GET"
            )) as ServerlessEnablementResponse;
            const enableServerless =
                serverlessEnablement?.setting?.value
                    ?.serverless_jobs_notebooks_workspace_enable_val?.value ===
                "ENABLED";
            state = {...state, enableServerless};
        } catch (e) {
            ctx?.logger?.error("Can't detect serverless support", e);
        }

        return new DatabricksWorkspace(id, authProvider, me, state);
    }
}
