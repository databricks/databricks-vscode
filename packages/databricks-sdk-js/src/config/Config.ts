/* eslint-disable @typescript-eslint/naming-convention */
import "reflect-metadata";
import {ExposedLoggers, NamedLogger} from "../logging";
import {
    attribute,
    ConfigAttributes,
    EnvironmentLoader,
    getAttributesFromDecorators,
} from "./ConfigAttributes";
import {DefaultCredentials} from "./DefaultCredentials";
import {KnownConfigLoader} from "./KnownConfigLoader";

export class ConfigError extends Error {
    constructor(readonly baseMessage: string, readonly config: Config) {
        let msg = baseMessage;
        const debugString = config.attributes.debugString();
        if (debugString) {
            msg += `. ${debugString}`;
        }

        super(msg);
    }
}

/**
 * CredentialsProvider responsible for configuring static or refreshable
 * authentication credentials for Databricks REST APIs
 */
export interface CredentialProvider {
    /** Name returns human-addressable name of this credentials provider name */
    name: AuthType;

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

type PublicInterface<T> = {[K in keyof T]: T[K]};
export type ConfigOptions = Partial<PublicInterface<Config>>;

export type AuthType =
    | "default"
    | "pat"
    | "basic"
    | "azure-cli"
    | "google-id"
    | "metadata-service";

export type AttributeName = keyof Omit<
    ConfigOptions,
    "credentials" | "logger" | "env" | "loaders"
>;

export class Config {
    /**
     * Credentials holds an instance of Credentials Provider to authenticate with Databricks REST APIs.
     * If no credentials provider is specified, `DefaultCredentials` are implicitly used.
     */
    public credentials?: CredentialProvider;

    /** Databricks host (either of workspace endpoint or Accounts API endpoint) */
    @attribute({name: "host", env: "DATABRICKS_HOST"})
    public host?: string;

    /** URL of the local metadata service that provides authentication credentials. */
    @attribute({
        name: "metadata_service_url",
        env: "DATABRICKS_METADATA_SERVICE_URL",
        auth: "metadata-service",
        sensitive: true,
    })
    public localMetadataServiceUrl?: string;

    /** Databricks Account ID for Accounts API. This field is used in dependencies. */
    @attribute({name: "account_id", env: "DATABRICKS_ACCOUNT_ID"})
    public accountId?: string;

    @attribute({
        name: "token",
        env: "DATABRICKS_TOKEN",
        auth: "pat",
        sensitive: true,
    })
    public token?: string;

    @attribute({
        name: "username",
        env: "DATABRICKS_USERNAME",
        auth: "basic",
    })
    public username?: string;

    @attribute({
        name: "password",
        env: "DATABRICKS_PASSWORD",
        auth: "basic",
        sensitive: true,
    })
    public password?: string;

    /** Connection profile specified within ~/.databrickscfg. */
    @attribute({name: "profile", env: "DATABRICKS_CONFIG_PROFILE"})
    public profile?: string;

    /**
     * Location of the Databricks CLI credentials file, that is created
     * by `databricks configure --token` command. By default, it is located
     * in ~/.databrickscfg.
     */
    @attribute({name: "config_file", env: "DATABRICKS_CONFIG_FILE"})
    public configFile?: string;

    @attribute({
        name: "google_service_account",
        env: "DATABRICKS_GOOGLE_SERVICE_ACCOUNT",
        auth: "google",
    })
    public googleServiceAccount?: string;

    @attribute({
        name: "google_credentials",
        env: "DATABRICKS_GOOGLE_CREDENTIALS",
        auth: "google",
        sensitive: true,
    })
    public googleCredentials?: string;

    /** Azure Resource Manager ID for Azure Databricks workspace, which is exhanged for a Host */
    @attribute({
        name: "azure_workspace_resource_id",
        env: "DATABRICKS_AZURE_RESOURCE_ID",
        auth: "azure",
    })
    public azureResourceId?: string;

    @attribute({
        name: "azure_use_msi",
        env: "ARM_USE_MSI",
        auth: "azure",
    })
    public azureUseMSI?: boolean;

    @attribute({
        name: "azure_client_secret",
        env: "ARM_CLIENT_SECRET",
        auth: "azure",
        sensitive: true,
    })
    public azureClientSecret?: string;

    @attribute({
        name: "azure_client_id",
        env: "ARM_CLIENT_ID",
        auth: "azure",
    })
    public azureClientId?: string;

    @attribute({
        name: "azure_tenant_id",
        env: "ARM_TENANT_ID",
        auth: "azure",
    })
    public azureTenantId?: string;

    /** AzureEnvironment (Public, UsGov, China, Germany) has specific set of API endpoints. */
    @attribute({
        name: "azure_environment",
        env: "ARM_ENVIRONMENT",
    })
    public azureEnvironment?: string;

    // Azure Login Application ID. Must be set if authenticating for non-production workspaces.
    @attribute({
        name: "azure_login_app_id",
        env: "DATABRICKS_AZURE_LOGIN_APP_ID",
        auth: "azure",
    })
    public azureLoginAppId?: string;

    // When multiple auth attributes are available in the environment, use the auth type
    // specified by this argument. This argument also holds currently selected auth.
    @attribute({
        name: "auth_type",
        env: "DATABRICKS_AUTH_TYPE",
    })
    public authType?: AuthType;

    /**
     * Skip SSL certificate verification for HTTP calls.
     * Use at your own risk or for unit testing purposes.
     */
    @attribute({
        name: "skip_verify",
    })
    public insecureSkipVerify?: boolean;

    /** Number of seconds for HTTP timeout */
    @attribute({
        name: "http_timeout_seconds",
    })
    public httpTimeoutSeconds?: number;

    // // Truncate JSON fields in JSON above this limit. Default is 96.
    // DebugTruncateBytes int `name:"debug_truncate_bytes" env:"DATABRICKS_DEBUG_TRUNCATE_BYTES" auth:"-"`

    // // Debug HTTP headers of requests made by the provider. Default is false.
    // DebugHeaders bool `name:"debug_headers" env:"DATABRICKS_DEBUG_HEADERS" auth:"-"`

    // // Maximum number of requests per second made to Databricks REST API.
    // RateLimitPerSecond int `name:"rate_limit" env:"DATABRICKS_RATE_LIMIT" auth:"-"`

    /** Number of seconds to keep retrying HTTP requests. Default is 300 (5 minutes) */
    @attribute({
        name: "retry_timeout_seconds",
    })
    retryTimeoutSeconds?: number;

    private resolved = false;
    private auth?: RequestVisitor;
    readonly attributes: ConfigAttributes;
    public logger: NamedLogger;
    public env: typeof process.env;

    constructor(private config: ConfigOptions) {
        this.attributes = getAttributesFromDecorators(
            Object.getPrototypeOf(this),
            this
        );

        for (const [key, value] of Object.entries(config)) {
            (this as any)[key] = value;
        }
        this.logger =
            config.logger || NamedLogger.getOrCreate(ExposedLoggers.SDK);
        this.env = config.env || process.env;
    }

    async getHost(): Promise<URL> {
        await this.ensureResolved();
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
            (!!this.host &&
                !!this.host.match(
                    /(\.databricks\.azure\.us|\.databricks\.azure\.cn|\.azuredatabricks\.net)$/
                )) ||
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

    /**
     * isAccountClient returns true if client is configured for Accounts API
     */
    public isAccountClient(): boolean {
        return !!this.host && this.host.startsWith("https://accounts.");
    }

    public async ensureResolved() {
        if (this.resolved) {
            return;
        }

        const loaders = [new EnvironmentLoader(), new KnownConfigLoader()];

        for (const loader of loaders) {
            this.logger.info(`Loading config via ${loader.name}`);
            await loader.configure(this);
        }

        await this.attributes.validate();

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

        try {
            this.auth = await this.credentials.configure(this);
        } catch (e) {
            if (e instanceof ConfigError) {
                throw new ConfigError(
                    `${this.credentials.name} auth: ${e.baseMessage}`,
                    this
                );
            }

            throw e;
        }
        this.authType = this.credentials.name;
    }
}
