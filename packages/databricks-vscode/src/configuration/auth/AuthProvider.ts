/* eslint-disable @typescript-eslint/naming-convention */
import {
    Config,
    ProductVersion,
    WorkspaceClient,
} from "@databricks/databricks-sdk";
import { Disposable } from "vscode";
import { workspaceConfigs } from "../../vscode-objs/WorkspaceConfigs";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const extensionVersion = require("../../../package.json")
    .version as ProductVersion;

export type AuthType = "azure-cli" | "google-id" | "bricks-cli" | "profile";

export abstract class AuthProvider implements Disposable {
    constructor(
        private readonly _host: URL,
        private readonly _authType: AuthType
    ) { }

    dispose() { }

    get host(): URL {
        return this._host;
    }

    get authType(): AuthType {
        return this._authType;
    }

    /**
     * Used to display the auth method in the UI
     */
    abstract describe(): string;
    abstract toJSON(): Record<string, unknown>;

    async getWorkspaceClient(): Promise<WorkspaceClient> {
        const config = await this.getSdkConfig();

        return new WorkspaceClient(config, {
            product: "databricks-vscode",
            productVersion: extensionVersion,
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async check(silent: boolean): Promise<boolean> {
        return true;
    }

    protected abstract getSdkConfig(): Promise<Config>;
}
