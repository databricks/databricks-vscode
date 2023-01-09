/* eslint-disable @typescript-eslint/naming-convention */
import {
    Config,
    ProductVersion,
    WorkspaceClient,
} from "@databricks/databricks-sdk";
import {normalizeHost} from "../../utils/urlUtils";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const extensionVersion = require("../../../package.json")
    .version as ProductVersion;

import {AzureCliCheck} from "../AzureCliCheck";

export type AuthType =
    | "azure-cli"
    | "google-id"
    | "oauth-u2m"
    | "profile"
    | "pat";

export abstract class AuthProvider {
    constructor(
        private readonly _host: URL,
        private readonly _authType: AuthType
    ) {}

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
    abstract getEnvVars(): Record<string, string | undefined>;

    getWorkspaceClient(): WorkspaceClient {
        const config = this.getSdkConfig();

        return new WorkspaceClient(config, {
            product: "databricks-vscode",
            productVersion: extensionVersion,
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async check(silent: boolean): Promise<boolean> {
        return true;
    }

    protected abstract getSdkConfig(): Config;

    static fromJSON(json: Record<string, any>): AuthProvider {
        const host =
            json.host instanceof URL
                ? json.host
                : normalizeHost(json.host as string);
        if (!host) {
            throw new Error("Missing host");
        }

        if (!json.authType) {
            throw new Error("Missing authType");
        }

        switch (json.authType as AuthType) {
            case "azure-cli":
                return new AzureCliAuthProvider(host);

            case "profile":
                if (!json.profile) {
                    throw new Error("Missing profile");
                }
                return new ProfileAuthProvider(host, json.profile);

            case "pat":
                if (!json.token) {
                    throw new Error("Missing token");
                }
                return new TokenAuthProvider(host, json.token);

            default:
                throw new Error(`Unknown auth type: ${json.authType}`);
        }
    }
}

export class TokenAuthProvider extends AuthProvider {
    constructor(host: URL, private readonly token: string) {
        super(host, "pat");
    }

    describe(): string {
        return "Personal Access Token";
    }

    toJSON(): Record<string, unknown> {
        return {
            host: this.host.toString(),
            authType: this.authType,
            token: this.token,
        };
    }

    getEnvVars(): Record<string, string | undefined> {
        return {
            DATABRICKS_HOST: this.host.toString(),
            DATABRICKS_AUTH_TYPE: this.authType,
            DATABRICKS_TOKEN: this.token,
        };
    }

    getSdkConfig(): Config {
        return new Config({
            authType: "pat",
            token: this.token,
            host: this.host.toString(),
            env: {},
        });
    }
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

    getEnvVars(): Record<string, string | undefined> {
        return {
            DATABRICKS_CONFIG_PROFILE: this.profile,
            DATABRICKS_CONFIG_FILE: process.env.DATABRICKS_CONFIG_FILE,
        };
    }

    getSdkConfig(): Config {
        return new Config({
            profile: this.profile,
            configFile: process.env.DATABRICKS_CONFIG_FILE,
            env: {},
        });
    }
}

export class AzureCliAuthProvider extends AuthProvider {
    constructor(host: URL) {
        super(host, "azure-cli");
    }

    describe(): string {
        return "Azure CLI";
    }

    toJSON(): Record<string, unknown> {
        return {
            host: this.host.toString(),
            authType: this.authType,
        };
    }

    getEnvVars(): Record<string, string | undefined> {
        return {
            DATABRICKS_HOST: this.host.toString(),
            DATABRICKS_AUTH_TYPE: this.authType,
        };
    }

    getSdkConfig(): Config {
        return new Config({
            host: this.host.toString(),
            authType: "azure-cli",
            env: {},
        });
    }

    async check(silent: boolean): Promise<boolean> {
        return await new AzureCliCheck(this).check(silent);
    }
}
