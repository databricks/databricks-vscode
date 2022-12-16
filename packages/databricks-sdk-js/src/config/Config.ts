/* eslint-disable @typescript-eslint/naming-convention */
import {assert} from "console";
import {ConfigAttributes} from "./ConfigAttributes";
import {DefaultCredentials} from "./DefaultCredentials";
import {KnownConfigLoader} from "./KnownConfigLoader";

/**
 * CredentialsProvider responsible for configuring static or refreshable
 * authentication credentials for Databricks REST APIs
 */
export interface CredentialProvider {
    /** Name returns human-addressable name of this credentials provider name */
    name: string;

    /**
     * Configure creates HTTP Request Visitor or returns undefined if a given credetials
     * are not configured. It throws an error if credentials are misconfigured.
     */
    configure(config: Config): Promise<RequestVisitor | undefined>;
}

export interface Loader {
    /** Name is human-addressable representation of this config resolver */
    name: string;
    configure(config: Config): Promise<void>;
}

export interface Logger {
    debug(message: string): void;
    info(message: string): void;
}

export type Headers = Record<string, string>;
export type RequestVisitor = (headers: Headers) => Promise<void>;

export interface ConfigOptions {
    /**
     * Credentials holds an instance of Credentials Provider to authenticate with Databricks REST APIs.
     * If no credentials provider is specified, `DefaultCredentials` are implicitly used.
     */
    credentials: CredentialProvider;

    /** Databricks host (either of workspace endpoint or Accounts API endpoint) */
    host: string;

    /** Databricks Account ID for Accounts API. This field is used in dependencies. */
    accountId: string;

    token: string;
    username: string;
    password: string;

    /** Connection profile specified within ~/.databrickscfg. */
    profile: string;

    /**
     * Location of the Databricks CLI credentials file, that is created
     * by `databricks configure --token` command. By default, it is located
     * in ~/.databrickscfg.
     */
    configFile: string;

    googleServiceAccount: string;
    googleCredentials: string;

    /** Azure Resource Manager ID for Azure Databricks workspace, which is exhanged for a Host */
    azureResourceId: string;

    azureUseMSI: boolean;
    azureClientSecret: string;
    azureClientId: string;
    azureTenantId: string;

    /** AzureEnvironment (Public, UsGov, China, Germany) has specific set of API endpoints. */
    azureEnvironment: string;

    // Azure Login Application ID. Must be set if authenticating for non-production workspaces.
    azureLoginAppId: string;

    // When multiple auth attributes are available in the environment, use the auth type
    // specified by this argument. This argument also holds currently selected auth.
    authType: string;

    logger: Logger;
    // // Skip SSL certificate verification for HTTP calls.
    // // Use at your own risk or for unit testing purposes.
    // insecureSkipVerify bool `name:"skip_verify" auth:"-"`

    // // Number of seconds for HTTP timeout
    // HTTPTimeoutSeconds int `name:"http_timeout_seconds" auth:"-"`

    // // Truncate JSON fields in JSON above this limit. Default is 96.
    // DebugTruncateBytes int `name:"debug_truncate_bytes" env:"DATABRICKS_DEBUG_TRUNCATE_BYTES" auth:"-"`

    // // Debug HTTP headers of requests made by the provider. Default is false.
    // DebugHeaders bool `name:"debug_headers" env:"DATABRICKS_DEBUG_HEADERS" auth:"-"`

    // // Maximum number of requests per second made to Databricks REST API.
    // RateLimitPerSecond int `name:"rate_limit" env:"DATABRICKS_RATE_LIMIT" auth:"-"`

    // // Number of seconds to keep retrying HTTP requests. Default is 300 (5 minutes)
    // RetryTimeoutSeconds int `name:"retry_timeout_seconds" auth:"-"`

    loaders: Array<Loader>;

    userAgentExtra: Record<string, string>;
}

export const CONFIG_FILE_VALUES: Record<string, keyof ConfigOptions> = {
    host: "host",
    account_id: "accountId",
    token: "token",
    username: "username",
    password: "password",
    google_service_account: "googleServiceAccount",
    google_credentials: "googleCredentials",
    azure_resource_id: "azureResourceId",
    azure_use_msi: "azureUseMSI",
    azure_client_secret: "azureClientSecret",
    azure_client_id: "azureClientId",
    azure_tenant_id: "azureTenantId",
    azure_environment: "azureEnvironment",
    azure_login_app_id: "azureLoginAppId",
    auth_type: "authType",
};

export const ENV_TO_CONFIG: Record<string, keyof ConfigOptions> = {
    DATABRICKS_CONFIG_FILE: "configFile",
    DATABRICKS_PROFILE: "profile",
    DATABRICKS_HOST: "host",
    DATABRICKS_ACCOUNT_ID: "accountId",
    DATABRICKS_TOKEN: "token",
    DATABRICKS_USERNAME: "username",
    DATABRICKS_PASSWORD: "password",
    DATABRICKS_GOOGLE_SERVICE_ACCOUNT: "googleServiceAccount",
    DATABRICKS_GOOGLE_CREDENTIALS: "googleCredentials",
    DATABRICKS_AZURE_RESOURCE_ID: "azureResourceId",
    DATABRICKS_AZURE_USE_MSI: "azureUseMSI",
    ARM_USE_MSI: "azureUseMSI",
    DATABRICKS_AZURE_CLIENT_SECRET: "azureClientSecret",
    DATABRICKS_AZURE_CLIENT_ID: "azureClientId",
    DATABRICKS_AZURE_TENANT_ID: "azureTenantId",
    ARM_ENVIRONMENT: "azureEnvironment",
    DATABRICKS_AZURE_LOGIN_APP_ID: "azureLoginAppId",
};

export class Config {
    private resolved = false;
    private loaders: Array<Loader>;
    private auth?: RequestVisitor;

    readonly logger: Logger;
    readonly userAgentExtra: Record<string, string> = {};
    public credentials?: CredentialProvider;

    public configFile?: string;
    public profile?: string;
    public host?: string;
    public accountId?: string;
    public token?: string;
    public username?: string;
    public password?: string;
    public googleServiceAccount?: string;
    public googleCredentials?: string;
    public azureResourceId?: string;
    public azureUseMSI?: string;
    public azureClientSecret?: string;
    public azureClientId?: string;
    public azureTenantId?: string;
    public azureEnvironment?: string;
    public azureLoginAppId?: string;
    public authType?: string;

    constructor(private config: Partial<ConfigOptions>) {
        this.loaders = config.loaders || [
            new ConfigAttributes(),
            new KnownConfigLoader(),
        ];

        for (const [key, value] of Object.entries(config)) {
            (this as any)[key] = value;
        }
        this.logger = config.logger || console;
    }

    async getHost(): Promise<URL> {
        this.ensureResolved();
        return new URL(this.host!);
    }

    public setAttribute(name: keyof ConfigOptions, value: string) {
        (this as any)[name] = value;
    }

    /**
     * Authenticate adds special headers to HTTP request to authorize it to work with Databricks REST API
     */
    async authenticate(headers: Headers): Promise<void> {
        await this.ensureResolved();
        await this.configureCredentialProvider();
        return this.auth!(headers);
    }

    /**
     * isAzure returns true if client is configured for Azure Databricks
     */
    public isAzure(): boolean {
        assert(this.host);
        return (
            this.host!.endsWith(".azuredatabricks.net") ||
            !!this.azureResourceId
        );
    }

    /**
     * isGcp returns true if client is configured for GCP
     */
    public isGcp(): boolean {
        assert(this.host);
        return this.host!.endsWith(".gcp.databricks.com");
    }

    /**
     * isAws returns true if client is configured for AWS
     */
    public isAws(): boolean {
        return !this.isAzure() && !this.isGcp();
    }

    public async ensureResolved() {
        if (this.resolved) {
            return;
        }

        for (const loader of this.loaders) {
            this.logger.info(`Loading config via ${loader.name}`);
            await loader.configure(this);
        }

        if (!this.host) {
            throw new Error("Host is not specified");
        }

        this.fixHost();
        this.resolved = true;
    }

    private fixHost() {
        const host = new URL(this.host!);
        this.host = `https://${host.hostname}`;
    }

    private async configureCredentialProvider() {
        if (this.auth) {
            return;
        }

        if (!this.credentials) {
            this.credentials = new DefaultCredentials();
        }

        this.auth = await this.credentials.configure(this);
        this.authType = this.credentials.name;
    }
}
