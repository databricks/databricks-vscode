import {ApiClient, CurrentUserService, scim} from "@databricks/databricks-sdk";
import {Uri} from "vscode";

export class DatabricksWorkspace {
    private constructor(private _host: Uri, private me: scim.User) {}

    get host(): Uri {
        return this._host;
    }

    get username(): string {
        return this.me.userName || "";
    }

    // get groups(): {};

    static async load(client: ApiClient) {
        const credentialProvider = await client.credentialProvider();
        const host = Uri.parse(credentialProvider.host.toString());

        const scimApi = new CurrentUserService(client);
        const me = await scimApi.me();

        return new DatabricksWorkspace(host, me);
    }
}
