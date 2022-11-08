import {
    ApiClient,
    Cluster,
    CurrentUserService,
    scim,
    WorkspaceConf,
    WorkspaceConfProps,
} from "@databricks/databricks-sdk";
import {Uri} from "vscode";

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
        }
    }

    static async load(client: ApiClient, profile: string) {
        const host = Uri.parse((await client.host).toString());

        const scimApi = new CurrentUserService(client);
        const me = await scimApi.me();

        const wsConfApi = new WorkspaceConf(client);
        const state = await wsConfApi.getStatus([
            "enableProjectTypeInWorkspace",
            "enableWorkspaceFilesystem",
        ]);

        return new DatabricksWorkspace(host, me, state as any, profile);
    }
}
