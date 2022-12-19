/* eslint-disable @typescript-eslint/naming-convention */
import {ExposedLoggers, NamedLogger} from "../logging";
import {ConfigAttributes, EnvironmentLoader} from "./ConfigAttributes";
import {DefaultCredentials} from "./DefaultCredentials";
import {KnownConfigLoader} from "./KnownConfigLoader";

export class CredentialsProviderError extends Error {}

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

    logger: NamedLogger;

    env: Record<string, string>;
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

    product: string;
    productVersion: ProductVersion;
    userAgentExtra: Record<string, string>;
}

export type AuthType = "pat" | "basic" | "azure-cli" | "google-id";
export type AttributeName = keyof Omit<
    ConfigOptions,
    | "credentials"
    | "logger"
    | "env"
    | "loaders"
    | "userAgentExtra"
    | "product"
    | "productVersion"
>;

export const SENSISTIVE_FIELDS = new Set<AttributeName>([
    "token",
    "password",
    "googleCredentials",
    "azureClientSecret",
]);

export const AUTH_TYPE_FOR_CONFIG: Record<AttributeName, AuthType | undefined> =
    {
        host: undefined,
        accountId: undefined,
        token: "pat",
        username: "basic",
        password: "basic",
        profile: undefined,
        configFile: undefined,
        googleServiceAccount: "google-id",
        googleCredentials: "google-id",
        azureResourceId: "azure-cli",
        azureEnvironment: undefined,
        azureUseMSI: "azure-cli",
        azureClientSecret: "azure-cli",
        azureClientId: "azure-cli",
        azureTenantId: "azure-cli",
        azureLoginAppId: "azure-cli",
        authType: undefined,
    };

export const CONFIG_FILE_FIELD_NAMES: Record<
    AttributeName,
    string | undefined
> = {
    host: "host",
    accountId: "account_id",
    token: "token",
    username: "username",
    password: "password",
    googleServiceAccount: "google_service_account",
    googleCredentials: "google_credentials",
    azureResourceId: "azure_resource_id",
    azureUseMSI: "azure_use_msi",
    azureClientSecret: "azure_client_secret",
    azureClientId: "azure_client_id",
    azureTenantId: "azure_tenant_id",
    azureEnvironment: "azure_environment",
    azureLoginAppId: "azure_login_app_id",
    authType: "auth_type",
    profile: undefined,
    configFile: undefined,
};

export const ENV_VAR_NAMES: Record<AttributeName, string> = {
    configFile: "DATABRICKS_CONFIG_FILE",
    profile: "DATABRICKS_PROFILE",
    host: "DATABRICKS_HOST",
    accountId: "DATABRICKS_ACCOUNT_ID",
    token: "DATABRICKS_TOKEN",
    username: "DATABRICKS_USERNAME",
    password: "DATABRICKS_PASSWORD",
    googleServiceAccount: "DATABRICKS_GOOGLE_SERVICE_ACCOUNT",
    googleCredentials: "DATABRICKS_GOOGLE_CREDENTIALS",
    azureResourceId: "DATABRICKS_AZURE_RESOURCE_ID",
    azureUseMSI: "ARM_USE_MSI",
    azureClientSecret: "DATABRICKS_AZURE_CLIENT_SECRET",
    azureClientId: "DATABRICKS_AZURE_CLIENT_ID",
    azureTenantId: "DATABRICKS_AZURE_TENANT_ID",
    azureEnvironment: "ARM_ENVIRONMENT",
    azureLoginAppId: "DATABRICKS_AZURE_LOGIN_APP_ID",
    authType: "DATABRICKS_AUTH_TYPE",
};

export type ProductVersion = `${number}.${number}.${number}`;

export class Config {
    private resolved = false;
    private loaders?: Array<Loader>;
    private auth?: RequestVisitor;

    readonly logger: NamedLogger;
    readonly env: typeof process.env;
    readonly userAgentExtra: Record<string, string> = {};
    public product = "unknown";
    public productVersion: ProductVersion = "0.0.0";
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
        for (const [key, value] of Object.entries(config)) {
            (this as any)[key] = value;
        }
        this.logger =
            config.logger || NamedLogger.getOrCreate(ExposedLoggers.SDK);
        this.env = config.env || process.env;
    }

    async getHost(): Promise<URL> {
        this.ensureResolved();
        return new URL(this.host!);
    }

    public setAttribute(name: AttributeName, value: string) {
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
        return (
            (!!this.host && this.host.endsWith(".azuredatabricks.net")) ||
            !!this.azureResourceId
        );
    }

    /**
     * isGcp returns true if client is configured for GCP
     */
    public isGcp(): boolean {
        return !!this.host && this.host.endsWith(".gcp.databricks.com");
    }

    /**
     * isAws returns true if client is configured for AWS
     */
    public isAws(): boolean {
        return !!this.host && !this.isAzure() && !this.isGcp();
    }

    public async ensureResolved() {
        if (this.resolved) {
            return;
        }

        const attributes = new ConfigAttributes(this);

        const loaders = this.loaders || [
            new EnvironmentLoader(attributes),
            new KnownConfigLoader(),
        ];

        for (const loader of loaders) {
            this.logger.info(`Loading config via ${loader.name}`);
            await loader.configure(this);
        }

        await attributes.validate();

        this.fixHost();
        this.resolved = true;
    }

    private fixHost() {
        if (!this.host) {
            return;
        }
        let host = this.host;

        if (!host.startsWith("http")) {
            host = `https://${host}`;
        }

        this.host = `https://${new URL(host).hostname}`;
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
