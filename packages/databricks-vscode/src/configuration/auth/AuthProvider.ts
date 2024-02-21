/* eslint-disable @typescript-eslint/naming-convention */
import {
    Config,
    ProductVersion,
    WorkspaceClient,
    logging,
} from "@databricks/databricks-sdk";
import {ProgressLocation, window} from "vscode";
import {normalizeHost} from "../../utils/urlUtils";
import {workspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const extensionVersion = require("../../../package.json")
    .version as ProductVersion;

import {AzureCliCheck} from "./AzureCliCheck";
import {DatabricksCliCheck} from "./DatabricksCliCheck";
import {Loggers} from "../../logger";

// TODO: Resolve this with SDK's AuthType.
export type AuthType = "azure-cli" | "databricks-cli" | "profile" | "pat";

export abstract class AuthProvider {
    constructor(
        private readonly _host: URL,
        private readonly _authType: AuthType,
        private checked: boolean = false
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
    abstract toJSON(): Record<string, string | undefined>;
    abstract toEnv(): Record<string, string>;
    abstract toIni(): Record<string, string | undefined> | undefined;

    getWorkspaceClient(): WorkspaceClient {
        const config = this.getSdkConfig();

        return new WorkspaceClient(config, {
            product: "databricks-vscode",
            productVersion: extensionVersion,
        });
    }

    /**
     * Check if the currently selected auth method can be used to login to Databricks.
     * This function should not throw an error and each implementing class must
     * handle it's own error messages and retry loops.
     */
    protected abstract _check(): Promise<boolean>;

    public async check(force = false, showProgress = true): Promise<boolean> {
        if (force) {
            this.checked = false;
        }
        if (this.checked) {
            return true;
        }

        const checkFn = async () => {
            this.checked = await this._check();
        };

        if (!showProgress) {
            await checkFn();
            return this.checked;
        }

        await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: `Databricks: Trying to login using ${this.describe()}`,
            },
            async () => await checkFn()
        );
        if (this.checked) {
            window.showInformationMessage(
                `Databricks: Successfully logged in using ${this.describe()}`
            );
        }

        return this.checked;
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

    static fromSdkConfig(config: Config): AuthProvider {
        if (!config.host) {
            throw new Error("Missing host");
        }
        const host = normalizeHost(config.host);

        switch (config.authType) {
            case "azure-cli":
                return new AzureCliAuthProvider(
                    host,
                    config.azureTenantId,
                    config.azureLoginAppId
                );

            case "databricks-cli":
                if (!config.databricksCliPath) {
                    throw new Error("Missing path for databricks-cli");
                }

                return new DatabricksCliAuthProvider(
                    host,
                    config.databricksCliPath
                );

            default:
                if (config.profile) {
                    return new ProfileAuthProvider(host, config.profile);
                }
                throw new Error(`Unknown auth type: ${config.authType}`);
        }
    }
}

export class ProfileAuthProvider extends AuthProvider {
    static async from(profile: string, checked = false) {
        const host = await ProfileAuthProvider.getSdkConfig(profile).getHost();
        return new ProfileAuthProvider(host, profile, checked);
    }

    constructor(
        host: URL,
        private readonly profile: string,
        checked = false
    ) {
        super(host, "profile", checked);
    }

    describe(): string {
        return `Profile '${this.profile}'`;
    }

    toJSON() {
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

    toIni() {
        return undefined;
    }

    public static getSdkConfig(profile: string): Config {
        return new Config({
            profile: profile,
            configFile: workspaceConfigs.databrickscfgLocation,
            env: {},
        });
    }

    getSdkConfig(): Config {
        return ProfileAuthProvider.getSdkConfig(this.profile);
    }

    protected async _check() {
        while (true) {
            try {
                const sdkConfig = this.getSdkConfig();
                await sdkConfig.ensureResolved();
                const authProvider = AuthProvider.fromSdkConfig(sdkConfig);

                if (authProvider instanceof ProfileAuthProvider) {
                    const workspaceClient = this.getWorkspaceClient();
                    await workspaceClient.currentUser.me();
                    return true;
                }
                return await authProvider.check(false, false);
            } catch (e) {
                let message: string = `Can't login with config profile ${this.profile}`;
                if (e instanceof Error) {
                    message = `Can't login with config profile ${this.profile}: ${e.message}`;
                }
                logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                    message,
                    e
                );
                const choice = await window.showErrorMessage(
                    message,
                    "Retry",
                    "Cancel"
                );
                if (choice === "Retry") {
                    continue;
                }
                return false;
            }
        }
    }
}

export class DatabricksCliAuthProvider extends AuthProvider {
    constructor(
        host: URL,
        readonly databricksPath: string
    ) {
        super(host, "databricks-cli");
    }

    describe(): string {
        return "OAuth U2M";
    }

    toJSON() {
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
        };
    }

    toIni() {
        return {
            host: this.host.toString(),
            auth_type: "databricks-cli",
            databricks_cli_path: this.databricksPath,
        };
    }

    protected async _check(): Promise<boolean> {
        const databricksCliCheck = new DatabricksCliCheck(this);
        return databricksCliCheck.check();
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

    toJSON() {
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

    toIni() {
        return {
            host: this.host.toString(),
            auth_type: "azure-cli",
            azure_login_app_id: this.appId,
        };
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

    protected async _check(): Promise<boolean> {
        const cliCheck = new AzureCliCheck(this);
        const result = await cliCheck.check();
        this._tenantId = cliCheck.tenantId;
        this._appId = cliCheck.azureLoginAppId;
        return result;
    }
}

export class PersonalAccessTokenAuthProvider extends AuthProvider {
    constructor(
        host: URL,
        private readonly token: string
    ) {
        super(host, "pat");
    }

    describe(): string {
        return "Personal Access Token";
    }
    toJSON(): Record<string, string | undefined> {
        return {
            host: this.host.toString(),
            authType: this.authType,
            token: this.token,
        };
    }
    toEnv(): Record<string, string> {
        return {
            DATABRICKS_HOST: this.host.toString(),
            DATABRICKS_AUTH_TYPE: this.authType,
            DATABRICKS_TOKEN: this.token,
        };
    }
    toIni(): Record<string, string | undefined> | undefined {
        return {
            host: this.host.toString(),
            token: this.token,
        };
    }
    protected async _check(): Promise<boolean> {
        while (true) {
            try {
                const workspaceClient = this.getWorkspaceClient();
                await workspaceClient.currentUser.me();
                return true;
            } catch (e) {
                let message: string = `Can't login with the provided Personal Access Token`;
                if (e instanceof Error) {
                    message = `Can't login with the provided Personal Access Token: ${e.message}`;
                }
                logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                    message,
                    e
                );
                const choice = await window.showErrorMessage(
                    message,
                    "Retry",
                    "Cancel"
                );
                if (choice === "Retry") {
                    continue;
                }
                return false;
            }
        }
    }
    protected getSdkConfig(): Config {
        return new Config({
            host: this.host.toString(),
            authType: "pat",
            token: this.token,
        });
    }
}
