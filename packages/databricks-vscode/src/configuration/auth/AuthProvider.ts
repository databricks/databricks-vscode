/* eslint-disable @typescript-eslint/naming-convention */
import {
    Config,
    ProductVersion,
    WorkspaceClient,
    logging,
} from "@databricks/sdk-experimental";
import {CancellationToken, ProgressLocation, window} from "vscode";
import {normalizeHost} from "../../utils/urlUtils";
import {workspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const extensionVersion = require("../../../package.json")
    .version as ProductVersion;

import {AzureCliCheck} from "./AzureCliCheck";
import {DatabricksCliCheck} from "./DatabricksCliCheck";
import {Loggers} from "../../logger";
import {CliWrapper} from "../../cli/CliWrapper";

// TODO: Resolve this with SDK's AuthType.
export type AuthType =
    | "azure-cli"
    | "databricks-cli"
    | "google-id"
    | "profile"
    | "pat";

export abstract class AuthProvider {
    constructor(
        private readonly _host: URL,
        private readonly _authType: AuthType,
        private readonly _cli: CliWrapper,
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

    async getWorkspaceClient(): Promise<WorkspaceClient> {
        const config = await this.getSdkConfig();

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
    protected abstract _check(
        profile?: string,
        token?: CancellationToken
    ): Promise<boolean>;

    public async check(
        force = false,
        showProgress = true,
        profile?: string,
        cancellationToken?: CancellationToken
    ): Promise<boolean> {
        if (force) {
            this.checked = false;
        }
        if (this.checked) {
            return true;
        }

        const checkFn = async (token?: CancellationToken) => {
            this.checked = await this._check(profile, token);
        };

        if (!showProgress) {
            await checkFn(cancellationToken);
            return this.checked;
        }

        let cancellationRequested = false;
        let task: Promise<void> = Promise.resolve();
        await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: `Databricks: Logging in using ${this.describe()}`,
                cancellable: true,
            },
            async (progress, token) => {
                task = checkFn(token);
                await Promise.race([
                    task,
                    new Promise((resolve) =>
                        token.onCancellationRequested(resolve)
                    ),
                ]);
                cancellationRequested = token.isCancellationRequested;
            }
        );
        if (cancellationRequested) {
            await window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title: `Databricks: Cancelling login using ${this.describe()}`,
                },
                async () => {
                    await task;
                }
            );
            window.showErrorMessage("Databricks: Login cancelled");
            this.checked = false;
        }

        if (this.checked) {
            window.showInformationMessage(
                `Databricks: Successfully logged in using ${this.describe()}`
            );
        }

        return this.checked;
    }

    async getSdkConfig(): Promise<Config> {
        const config = this._getSdkConfig();
        await config.ensureResolved();
        if (config.databricksCliPath === undefined) {
            config.databricksCliPath = this._cli.cliPath;
        }

        return config;
    }

    protected abstract _getSdkConfig(): Config;

    static fromJSON(json: Record<string, any>, cli: CliWrapper): AuthProvider {
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
                return new DatabricksCliAuthProvider(
                    host,
                    json.databricksPath ?? cli.cliPath,
                    cli
                );

            case "profile":
                if (!json.profile) {
                    throw new Error("Missing profile");
                }
                return new ProfileAuthProvider(host, json.profile, cli);

            default:
                throw new Error(`Unknown auth type: ${json.authType}`);
        }
    }

    static fromSdkConfig(config: Config, cli: CliWrapper): AuthProvider {
        if (!config.host) {
            throw new Error("Missing host");
        }
        const host = normalizeHost(config.host);

        switch (config.authType) {
            case "azure-cli":
                return new AzureCliAuthProvider(
                    host,
                    cli,
                    config.azureTenantId,
                    config.azureLoginAppId
                );

            case "databricks-cli":
                return new DatabricksCliAuthProvider(
                    host,
                    config.databricksCliPath ?? cli.cliPath,
                    cli
                );

            default:
                if (config.profile) {
                    return new ProfileAuthProvider(host, config.profile, cli);
                }
                throw new Error(`Unknown auth type: ${config.authType}`);
        }
    }
}

export class ProfileAuthProvider extends AuthProvider {
    static async from(profile: string, cli: CliWrapper, checked = false) {
        const host = await ProfileAuthProvider.getSdkConfig(profile).getHost();
        return new ProfileAuthProvider(host, profile, cli, checked);
    }

    constructor(
        host: URL,
        readonly profile: string,
        private readonly cli: CliWrapper,
        checked = false
    ) {
        super(host, "profile", cli, checked);
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

    private static getSdkConfig(profile: string): Config {
        return new Config({
            profile: profile,
            configFile: workspaceConfigs.databrickscfgLocation,
            env: {},
        });
    }

    protected _getSdkConfig(): Config {
        return ProfileAuthProvider.getSdkConfig(this.profile);
    }

    protected async _check(
        profile?: string,
        cancellationToken?: CancellationToken
    ) {
        while (cancellationToken?.isCancellationRequested !== true) {
            try {
                const sdkConfig = await this.getSdkConfig();
                const authProvider = AuthProvider.fromSdkConfig(
                    sdkConfig,
                    this.cli
                );

                if (authProvider instanceof ProfileAuthProvider) {
                    const workspaceClient = await this.getWorkspaceClient();
                    await workspaceClient.currentUser.me();
                    return true;
                }

                return await authProvider.check(
                    false,
                    false,
                    this.profile,
                    cancellationToken
                );
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
        return false;
    }
}

export class DatabricksCliAuthProvider extends AuthProvider {
    constructor(
        host: URL,
        readonly cliPath: string,
        cli: CliWrapper
    ) {
        super(host, "databricks-cli", cli);
    }

    describe(): string {
        return "OAuth U2M";
    }

    toJSON() {
        return {
            host: this.host.toString(),
            authType: this.authType,
            databricksPath: this.cliPath,
        };
    }

    _getSdkConfig(): Config {
        return new Config({
            host: this.host.toString(),
            authType: "databricks-cli",
            databricksCliPath: this.cliPath,
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
        };
    }

    protected async _check(
        profile?: string,
        cancellationToken?: CancellationToken
    ): Promise<boolean> {
        const databricksCliCheck = new DatabricksCliCheck(this);
        return databricksCliCheck.check(profile, cancellationToken);
    }
}

export class AzureCliAuthProvider extends AuthProvider {
    private _tenantId?: string;
    private _appId?: string;

    constructor(host: URL, cli: CliWrapper, tenantId?: string, appId?: string) {
        super(host, "azure-cli", cli);

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

    _getSdkConfig(): Config {
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

    protected async _check(
        profile?: string,
        cancellationToken?: CancellationToken
    ): Promise<boolean> {
        const cliCheck = new AzureCliCheck(this);
        const result = await cliCheck.check(cancellationToken);
        this._tenantId = cliCheck.tenantId;
        this._appId = cliCheck.azureLoginAppId;
        return result;
    }
}

export class PersonalAccessTokenAuthProvider extends AuthProvider {
    constructor(
        host: URL,
        private readonly token: string,
        cli: CliWrapper
    ) {
        super(host, "pat", cli);
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
    protected async _check(
        profile?: string,
        cancellationToken?: CancellationToken
    ): Promise<boolean> {
        while (cancellationToken?.isCancellationRequested !== true) {
            try {
                const workspaceClient = await this.getWorkspaceClient();
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
        return false;
    }
    protected _getSdkConfig(): Config {
        return new Config({
            host: this.host.toString(),
            authType: "pat",
            token: this.token,
        });
    }
}
