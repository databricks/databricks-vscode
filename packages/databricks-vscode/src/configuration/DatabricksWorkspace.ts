import {
    ApiClient,
    Cluster,
    CurrentUserService,
    scim,
    WorkspaceConf,
    WorkspaceConfProps,
} from "@databricks/databricks-sdk";
import {Context, context} from "@databricks/databricks-sdk/dist/context";
import {withLogContext} from "@databricks/databricks-sdk/dist/logging";
import {Uri, window} from "vscode";
import {Loggers} from "../logger";

export class DatabricksWorkspace {
    constructor(
        private _host: Uri,
        private me: scim.User,
        private wsConf: WorkspaceConfProps,
        readonly profile: string
    ) {}

    get host(): Uri {
        return this._host;
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
        client: ApiClient,
        profile: string,
        @context ctx?: Context
    ) {
        const host = Uri.parse((await client.host).toString());

        const scimApi = new CurrentUserService(client);
        const me = await scimApi.me(ctx);

        const wsConfApi = new WorkspaceConf(client);
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

        return new DatabricksWorkspace(host, me, state, profile);
    }
}
