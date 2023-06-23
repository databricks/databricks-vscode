/* eslint-disable @typescript-eslint/naming-convention */
import {
    Config,
    ProductVersion,
    WorkspaceClient,
} from "@databricks/databricks-sdk";
import {normalizeHost} from "../../utils/urlUtils";
import {workspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const extensionVersion = require("../../../package.json")
    .version as ProductVersion;

import {AzureCliCheck} from "./AzureCliCheck";
import {DatabricksCliCheck} from "./DatabricksCliCheck";

// TODO: Resolve this with SDK's AuthType.
export type AuthType = "azure-cli" | "google-id" | "databricks-cli" | "profile";

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
    abstract toEnv(): Record<string, string>;

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

    static fromJSON(
        json: Record<string, any>,
        databricksPath: string
    ): AuthProvider {
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
                return new AzureCliAuthProvider(
                    host,
                    json.tenantId,
                    json.appId
                );

            case "databricks-cli":
                return new DatabricksCliAuthProvider(host, databricksPath);

            case "profile":
                if (!json.profile) {
                    throw new Error("Missing profile");
                }
                return new ProfileAuthProvider(host, json.profile);

            default:
                throw new Error(`Unknown auth type: ${json.authType}`);
        }
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

    toEnv(): Record<string, string> {
        return {
            DATABRICKS_HOST: this.host.toString(),
            DATABRICKS_CONFIG_PROFILE: this.profile,
        };
    }

    getSdkConfig(): Config {
        return new Config({
            profile: this.profile,
            configFile:
                workspaceConfigs.databrickscfgLocation ??
                process.env.DATABRICKS_CONFIG_FILE,
            env: {},
        });
    }
}

export class DatabricksCliAuthProvider extends AuthProvider {
    constructor(host: URL, readonly databricksPath: string) {
        super(host, "databricks-cli");
    }

    describe(): string {
        return "OAuth U2M";
    }

    toJSON(): Record<string, unknown> {
        return {
            host: this.host.toString(),
            authType: this.authType,
            databricksPath: this.databricksPath,
        };
    }

    getSdkConfig(): Config {
        return new Config({
            host: this.host.toString(),
            authType: "databricks-cli",
            databricksCliPath: this.databricksPath,
        });
    }

    toEnv(): Record<string, string> {
        return {
            DATABRICKS_HOST: this.host.toString(),
            DATABRICKS_AUTH_TYPE: "databricks-cli",
            DATABRICKS_CLI_PATH: this.databricksPath,
        };
    }

    async check(silent: boolean): Promise<boolean> {
        const databricksCliCheck = new DatabricksCliCheck(this);
        return databricksCliCheck.check(silent);
    }
}

export class AzureCliAuthProvider extends AuthProvider {
    private _tenantId?: string;
    private _appId?: string;

    constructor(host: URL, tenantId?: string, appId?: string) {
        super(host, "azure-cli");

        this._tenantId = tenantId;
        this._appId = appId;
    }

    get tenantId(): string | undefined {
        return this._tenantId;
    }

    get appId(): string | undefined {
        return this._appId;
    }

    describe(): string {
        return "Azure CLI";
    }

    toJSON(): Record<string, unknown> {
        return {
            host: this.host.toString(),
            authType: this.authType,
            tenantId: this.tenantId,
            appId: this.appId,
        };
    }

    getSdkConfig(): Config {
        return new Config({
            host: this.host.toString(),
            authType: "azure-cli",
            azureLoginAppId: this.appId,
            env: {},
        });
    }

    toEnv(): Record<string, string> {
        const envVars: Record<string, string> = {
            DATABRICKS_HOST: this.host.toString(),
            DATABRICKS_AUTH_TYPE: "azure-cli",
        };
        if (this.appId) {
            envVars["DATABRICKS_AZURE_LOGIN_APP_ID"] = this.appId;
        }
        return envVars;
    }

    async check(silent: boolean): Promise<boolean> {
        const cliCheck = new AzureCliCheck(this);
        const result = await cliCheck.check(silent);
        this._tenantId = cliCheck.tenantId;
        this._appId = cliCheck.azureLoginAppId;
        return result;
    }
}
