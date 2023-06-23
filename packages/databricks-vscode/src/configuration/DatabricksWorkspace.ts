import {
    WorkspaceClient,
    Cluster,
    scim,
    WorkspaceConf,
    WorkspaceConfProps,
} from "@databricks/databricks-sdk";
import {Context, context} from "@databricks/databricks-sdk/dist/context";
import {withLogContext} from "@databricks/databricks-sdk/dist/logging";
import {Uri} from "vscode";
import {Loggers} from "../logger";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {AuthProvider} from "./auth/AuthProvider";
import {RemoteUri} from "../sync/SyncDestination";

export class DatabricksWorkspace {
    constructor(
        private _authProvider: AuthProvider,
        private me: scim.User,
        private wsConf: WorkspaceConfProps
    ) {}

    /**
     * The current root for sync destination folders. Return a Workspace path or a Repo path
     * depending on whether files in workspace is enabled for VSCode UI.
     */
    get currentFsRoot(): RemoteUri {
        return workspaceConfigs.enableFilesInWorkspace
            ? this.workspaceFsRoot
            : this.repoRoot;
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

    get host(): Uri {
        return Uri.parse(this._authProvider.host.toString());
    }

    get authProvider(): AuthProvider {
        return this._authProvider;
    }

    get userName(): string {
        return this.me.userName || "";
    }

    get user(): scim.User {
        return this.me;
    }

    get isReposEnabled(): boolean {
        return this.wsConf.enableProjectTypeInWorkspace !== "false";
    }

    get isFilesInReposEnabled(): boolean {
        return this.wsConf.enableWorkspaceFilesystem !== "false";
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

    @withLogContext(Loggers.Extension, "DatabricksWorkspace.load")
    static async load(
        client: WorkspaceClient,
        authProvider: AuthProvider,
        @context ctx?: Context
    ) {
        const me = await client.currentUser.me(ctx);

        const wsConfApi = new WorkspaceConf(client.apiClient);
        let state: WorkspaceConfProps = {
            enableProjectTypeInWorkspace: "true",
            enableWorkspaceFilesystem: "true",
        };
        try {
            state = {
                ...state,
                ...(await wsConfApi.getStatus(
                    [
                        "enableProjectTypeInWorkspace",
                        "enableWorkspaceFilesystem",
                    ],
                    ctx
                )),
            };
        } catch (e) {
            ctx?.logger?.error("Can't fetch workspace confs", e);
        }

        return new DatabricksWorkspace(authProvider, me, state);
    }
}
