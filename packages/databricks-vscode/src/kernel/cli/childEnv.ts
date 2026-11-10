/**
 * The environment of every child process. A pure
 * function: CLI calls, terminals, debug sessions and the env file all build
 * their environment here, so "what do children see?" has one answer.
 *
 * It replaces `utils/envVarGenerators.ts`, without the credential broker:
 * children authenticate with the connection's profile, the way
 * `databricks … --profile X` does in a terminal.
 */

/** What children need to know about the connection. */
export interface ChildConnection {
    /** `session` is a session window's: its credentials are in the extension host's `DATABRICKS_*`. */
    readonly kind: "profile" | "session";
    readonly host: string;
    readonly profile?: string;
    readonly authType: string;
    /** A workspace the profile doesn't name: a bundle target's, for a profile signed in to its account only. */
    readonly workspaceId?: string;
}

/**
 * The certificate and proxy variables a child gets, matching what 2.22.0 gave
 * the same call:
 *
 * - `cli`: the CLI wrapper's curated environment. No `SSL_CERT_FILE` or
 *   `SSL_CERT_DIR`, which 2.22.0's CLI calls never had. The bundled CLI is
 *   built with Go's crypto/x509, whose loadSystemRoots replaces the platform
 *   store with these variables on macOS and Windows, and on Linux when
 *   SSL_CERT_DIR is set (SSL_CERT_FILE alone only replaces the file list). A
 *   corporate-only bundle there hides the CAs that CLI calls need. Proxy
 *   variables come from `http.proxy`.
 * - `inherited`: the host environment as it is, without `http.proxy`. The
 *   SDK's token calls and `az` ran this way, so a proxy that only VS Code can
 *   log in to doesn't break token refresh.
 * - `hostAndProxy`: the host environment with `http.proxy` over it, as
 *   `environments setup-local` ran in 2.22.0.
 */
export type ChildEnvironment = "cli" | "inherited" | "hostAndProxy";

/** The variables `cli` children don't inherit: the certificate ones, and every proxy name the overlay sets. */
const CURATED_CLI_DROPPED = [
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
] as const;

export interface ChildEnvInputs {
    /** The extension host's environment. Everything not listed here passes through. */
    readonly base: Readonly<Record<string, string | undefined>>;
    /** The resolved config file (AUTH-07). */
    readonly configFile: string;
    /** Undefined when signed out, for example while a profile is being created. */
    readonly connection?: ChildConnection;
    readonly cliPath: string;
    /** VS Code's `http.proxy` and `http.noProxy`. */
    readonly proxy?: { readonly httpProxy?: string; readonly noProxy?: readonly string[] };
    /**
     * Which 2.22.0 environment the certificate and proxy variables match.
     * Defaults to `cli` for a CLI call and `hostAndProxy` for any other child.
     */
    readonly environment?: ChildEnvironment;
    /** Set when the child is the Databricks CLI. */
    readonly cli?: { readonly extensionVersion: string };
    /**
     * The target's variable overrides (`vscode.bundlevars.json`), for bundle
     * CLI calls. Each becomes `BUNDLE_VAR_<name>`, which the CLI prefers to
     * the bundle's own values.
     */
    readonly bundleVariables?: Readonly<Record<string, string>>;
    /**
     * The compute the child runs on: `DATABRICKS_CLUSTER_ID`, or
     * `DATABRICKS_SERVERLESS_COMPUTE_ID=auto`. Bundle CLI calls get a cluster
     * only while "Override Jobs cluster in bundle" is checked (COMP-06).
     */
    readonly compute?: ChildCompute;
    /**
     * A bundle CLI call's project root. A session connection's child gets
     * it as `DATABRICKS_BUNDLE_ROOT`: otherwise the CLI looks for the bundle
     * from its working folder up, and a `databricks.yml` above the project
     * could send the session's token to a host the target guard never saw.
     */
    readonly bundleRoot?: string;
}

export type ChildCompute =
    | { readonly kind: "cluster"; readonly clusterId: string }
    | { readonly kind: "serverless" };

/**
 * Compute variables the SDKs and the CLI read. They are removed, like the
 * auth variables: compute is the target's choice, and a value in the VS Code
 * process would silently override it. A session window has the session's own
 * compute there (CLI `override_compute.go` reads `DATABRICKS_CLUSTER_ID` for
 * development targets).
 */
export const AMBIENT_COMPUTE_VARIABLES = [
    "DATABRICKS_CLUSTER_ID",
    "DATABRICKS_SERVERLESS_COMPUTE_ID",
] as const;

/**
 * Auth variables that would override the named profile. They are removed for
 * profile connections, so credentials in the VS Code process can't leak into
 * children or change which identity they use. `DATABRICKS_HOST`,
 * `DATABRICKS_CONFIG_PROFILE` and `DATABRICKS_CLI_PATH` are then set from the
 * connection. The SDKs also read the Azure (`ARM_*`), Google and OIDC
 * credentials below; with a PAT profile, any of them fails every call with
 * "more than one authorization method configured".
 */
export const AMBIENT_AUTH_VARIABLES = [
    "DATABRICKS_TOKEN",
    "DATABRICKS_CLIENT_ID",
    "DATABRICKS_CLIENT_SECRET",
    "DATABRICKS_AUTH_TYPE",
    "DATABRICKS_METADATA_SERVICE_URL",
    "DATABRICKS_USERNAME",
    "DATABRICKS_PASSWORD",
    "DATABRICKS_ACCOUNT_ID",
    "DATABRICKS_WORKSPACE_ID",
    "DATABRICKS_HOST",
    "DATABRICKS_CONFIG_PROFILE",
    "DATABRICKS_CLI_PATH",
    "DATABRICKS_AZURE_RESOURCE_ID",
    "DATABRICKS_AZURE_LOGIN_APP_ID",
    "DATABRICKS_GOOGLE_SERVICE_ACCOUNT",
    "DATABRICKS_GOOGLE_CREDENTIALS",
    "DATABRICKS_OIDC_TOKEN_ENV",
    "DATABRICKS_OIDC_TOKEN_FILEPATH",
    "ARM_CLIENT_ID",
    "ARM_CLIENT_SECRET",
    "ARM_TENANT_ID",
    "ARM_USE_MSI",
    "GOOGLE_CREDENTIALS",
] as const;

export function childEnv(inputs: ChildEnvInputs): Record<string, string> {
    const environment = inputs.environment ?? (inputs.cli !== undefined ? "cli" : "hostAndProxy");
    // Read from `base`, so the curated drop below doesn't change what the overlay sees.
    const proxy = environment === "inherited" ? {} : proxyVariables(inputs.base, inputs.proxy);
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(inputs.base)) {
        if (value !== undefined) {
            env[key] = value;
        }
    }
    if (environment === "cli") {
        for (const key of CURATED_CLI_DROPPED) {
            delete env[key];
        }
    }

    const { connection } = inputs;
    if (connection?.kind === "session") {
        // A session's credentials are in the environment, so they stay. Its
        // compute is the window's, not the child's: bundle calls would put a
        // development target's jobs on it. No profile may reroute the child.
        for (const key of [...AMBIENT_COMPUTE_VARIABLES, "DATABRICKS_CONFIG_PROFILE"]) {
            delete env[key];
        }
        if (inputs.bundleRoot !== undefined) {
            env.DATABRICKS_BUNDLE_ROOT = inputs.bundleRoot;
        }
    } else {
        for (const key of [...AMBIENT_AUTH_VARIABLES, ...AMBIENT_COMPUTE_VARIABLES]) {
            delete env[key];
        }
    }

    env.DATABRICKS_CONFIG_FILE = inputs.configFile;
    if (connection !== undefined) {
        env.DATABRICKS_HOST = connection.host;
        if (connection.kind === "profile" && connection.profile !== undefined) {
            env.DATABRICKS_CONFIG_PROFILE = connection.profile;
        }
        if (connection.workspaceId !== undefined) {
            env.DATABRICKS_WORKSPACE_ID = connection.workspaceId;
        }
        // Python SDKs and Jupyter kernels mint U2M tokens through the CLI.
        if (connection.authType === "databricks-cli") {
            env.DATABRICKS_CLI_PATH = inputs.cliPath;
        }
    }

    Object.assign(env, proxy);

    if (inputs.cli !== undefined) {
        env.DATABRICKS_OUTPUT_FORMAT = "json";
        env.DATABRICKS_CLI_UPSTREAM = "databricks-vscode";
        env.DATABRICKS_CLI_UPSTREAM_VERSION = inputs.cli.extensionVersion;
    }
    for (const [name, value] of Object.entries(inputs.bundleVariables ?? {})) {
        env[`BUNDLE_VAR_${name}`] = value;
    }
    if (inputs.compute?.kind === "cluster") {
        env.DATABRICKS_CLUSTER_ID = inputs.compute.clusterId;
        delete env.DATABRICKS_SERVERLESS_COMPUTE_ID;
    } else if (inputs.compute?.kind === "serverless") {
        env.DATABRICKS_SERVERLESS_COMPUTE_ID = "auto";
        delete env.DATABRICKS_CLUSTER_ID;
    }
    return env;
}

/**
 * The Go CLI reads only these variables for its proxy. VS Code's `http.proxy`
 * wins over the environment, as it does for the extension's own requests;
 * `http.noProxy` and `NO_PROXY` are merged, because a broader bypass list is
 * only ever safer.
 */
export function proxyVariables(
    base: Readonly<Record<string, string | undefined>>,
    proxy: ChildEnvInputs["proxy"] = {},
): Record<string, string> {
    const result: Record<string, string> = {};
    const http = proxy.httpProxy || base.HTTP_PROXY || base.http_proxy;
    const https = proxy.httpProxy || base.HTTPS_PROXY || base.https_proxy;
    const noProxy = [
        ...new Set(
            [...(proxy.noProxy ?? []), ...(base.NO_PROXY || base.no_proxy || "").split(",")]
                .map((v) => v.trim())
                .filter((v) => v.length > 0),
        ),
    ].join(",");
    if (http) {
        result.HTTP_PROXY = http;
    }
    if (https) {
        result.HTTPS_PROXY = https;
    }
    if (noProxy) {
        result.NO_PROXY = noProxy;
    }
    return result;
}
