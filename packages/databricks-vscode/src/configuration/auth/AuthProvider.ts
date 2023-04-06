/* eslint-disable @typescript-eslint/naming-convention */
import {
    Config,
    ProductVersion,
    WorkspaceClient,
} from "@databricks/databricks-sdk";
import { Disposable } from "vscode";
import { workspaceConfigs } from "../../vscode-objs/WorkspaceConfigs";
import { BricksCliCheck } from "./BricksCliCheck";

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

export class ProfileAuthProvider extends AuthProvider {
    constructor(host: URL, private readonly profile: string) {
        super(host, "profile");
    }

    describe(): string {
        return `Profile '${this.profile}'`;
    }

    toJSON(): Record<string, unknown> {
        return {
            host: this.host.toString(),
            authType: this.authType,
            profile: this.profile,
        };
    }

    async getSdkConfig(): Promise<Config> {
        return new Config({
            profile: this.profile,
            configFile:
                workspaceConfigs.databrickscfgLocation ??
                process.env.DATABRICKS_CONFIG_FILE,
            env: {},
        });
    }
}

export class BricksCliAuthProvider extends AuthProvider {
    constructor(host: URL, readonly bricksPath: string) {
        super(host, "bricks-cli");
    }

    describe(): string {
        return "OAuth U2M";
    }

    toJSON(): Record<string, unknown> {
        return {
            host: this.host.toString(),
            authType: this.authType,
            bricksPath: this.bricksPath,
        };
    }

    async getSdkConfig(): Promise<Config> {
        return new Config({
            host: this.host.toString(),
            authType: "bricks-cli",
            bricksCliPath: this.bricksPath,
        });
    }

    async check(silent: boolean): Promise<boolean> {
        const bricksCliCheck = new BricksCliCheck(this);
        return bricksCliCheck.check(silent);
    }
}
