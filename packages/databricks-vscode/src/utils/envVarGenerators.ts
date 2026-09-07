import {Loggers} from "../logger";
import {readFile} from "fs/promises";
import {ExtensionContext, Uri} from "vscode";
import {logging, Headers} from "@databricks/sdk-experimental";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {TerraformMetadata} from "./terraformUtils";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const packageJson = require("../../package.json");

const extensionVersion = packageJson.version;
const terraformMetadata = packageJson.terraformMetadata as TerraformMetadata;

//Get env variables from user's .env file
export async function getUserEnvVars(userEnvPath: Uri) {
    try {
        return (await readFile(userEnvPath.fsPath, "utf-8"))
            .split(/\r?\n/)
            .map((value) => {
                const splits = value.split("=");
                return [splits[0], splits.slice(1).join("=")];
            })
            .filter(([key, value]) => key.length && value.length)
            .reduce((prev: Record<string, string>, cur) => {
                if (!Object.keys(prev).includes(cur[0])) {
                    prev[cur[0]] = cur[1];
                }
                return prev;
            }, {});
    } catch (e: unknown) {
        logging.NamedLogger.getOrCreate(Loggers.Extension).error(
            "Can't load .env file",
            e
        );
    }
}

export function getIdeEnvVars() {
    /* eslint-disable @typescript-eslint/naming-convention */
    return {
        //https://github.com/fabioz/PyDev.Debugger/blob/main/_pydevd_bundle/pydevd_constants.py
        PYDEVD_WARN_SLOW_RESOLVE_TIMEOUT: "10",
    };
    /* eslint-enable @typescript-eslint/naming-convention */
}

function getUserAgent(connectionManager: ConnectionManager) {
    const client = connectionManager.apiClient;
    if (!client) {
        return;
    }

    return `${client.product}/${client.productVersion}`;
}

export function getAuthEnvVars(connectionManager: ConnectionManager) {
    const host = connectionManager.databricksWorkspace?.host.toString();
    if (!host || !connectionManager.metadataServiceUrl) {
        return;
    }

    // For SPOG (unified host) connections the Go CLI SDK must know the
    // workspace_id so it can add the X-Databricks-Org-Id routing header.
    const workspaceId = connectionManager.apiClient?.config?.workspaceId;

    /* eslint-disable @typescript-eslint/naming-convention */
    return {
        DATABRICKS_HOST: host,
        DATABRICKS_AUTH_TYPE: "metadata-service",
        DATABRICKS_METADATA_SERVICE_URL: connectionManager.metadataServiceUrl,
        ...(workspaceId ? {DATABRICKS_WORKSPACE_ID: workspaceId} : {}),
    };
    /* eslint-enable @typescript-eslint/naming-convention */
}

export function getCommonDatabricksEnvVars(
    connectionManager: ConnectionManager,
    bundleTarget?: string
) {
    const cluster = connectionManager.cluster;
    /* eslint-disable @typescript-eslint/naming-convention */
    return {
        DATABRICKS_BUNDLE_TARGET: bundleTarget,
        ...(getAuthEnvVars(connectionManager) || {}),
        ...(getProxyEnvVars() || {}),
        DATABRICKS_CLUSTER_ID: connectionManager.serverless
            ? undefined
            : cluster?.id,
        DATABRICKS_SERVERLESS_COMPUTE_ID: connectionManager.serverless
            ? "auto"
            : undefined,
    };
    /* eslint-enable @typescript-eslint/naming-convention */
}

async function getPatToken(connectionManager: ConnectionManager) {
    const headers: Headers = new Headers();
    await connectionManager.apiClient?.config.authenticate(headers);
    return headers.get("Authorization")?.split(" ")[1];
}

async function getSparkRemoteEnvVar(connectionManager: ConnectionManager) {
    const host = connectionManager.databricksWorkspace?.host.host;
    const authType = connectionManager.authType;

    // We export spark remote only for profile auth type. This is to support
    // SparkSession builder in oss spark connect (and also dbconnect).
    // For all other auth types, we don't export spark remote and expect users
    // to use DatabricksSession for full functionality.
    if (host && connectionManager.cluster && authType === "pat") {
        const pat = await getPatToken(connectionManager);
        if (pat) {
            return {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                SPARK_REMOTE: `sc://${host}:443/;token=${pat};use_ssl=true;x-databricks-cluster-id=${connectionManager.cluster.id}`,
            };
        }
    }
}

export async function getDbConnectEnvVars(
    connectionManager: ConnectionManager,
    projectRootUri: Uri,
    showDatabricksConnectProgess: boolean
) {
    const userAgent = getUserAgent(connectionManager);
    const existingSparkUa = process.env.SPARK_CONNECT_USER_AGENT ?? "";

    /* eslint-disable @typescript-eslint/naming-convention */
    return {
        //We append our user agent to any existing SPARK_CONNECT_USER_AGENT defined in the
        //environment of the parent process of VS Code.
        SPARK_CONNECT_USER_AGENT: [existingSparkUa, userAgent].join(" ").trim(),
        SPARK_CONNECT_PROGRESS_BAR_ENABLED: showDatabricksConnectProgess
            ? "1"
            : "0",
        DATABRICKS_PROJECT_ROOT: projectRootUri.fsPath,
        ...((await getSparkRemoteEnvVar(connectionManager)) || {}),
    };
    /* eslint-enable @typescript-eslint/naming-convention */
}

/**
 * Proxy env vars forwarded to the bundled Databricks CLI (and any other
 * subprocess). The Go CLI does no proxy handling of its own — it relies on Go's
 * `http.ProxyFromEnvironment`, which reads only these env vars — so this is the
 * only way to route CLI traffic through a proxy.
 *
 * Precedence mirrors the in-process SDK path (`proxyAgent.ts`
 * `getProxyAgentParams`): the VS Code `http.proxy` setting wins over the OS
 * `http(s)_proxy` env vars. That keeps the CLI and the SDK resolving the same
 * proxy from the same inputs, so a user who configures the proxy purely through
 * the VS Code setting gets it applied to both. `no_proxy` is the exception — the
 * `http.noProxy` setting and the env var are *unioned* (not overridden), since a
 * bypass list is only ever safer when it's broader.
 *
 * Absent values stay `undefined` so `removeUndefinedKeys(...)` at the call sites
 * strips them, leaving the CLI's own env untouched when nothing is configured.
 */
export function getProxyEnvVars() {
    // The `http.proxy` setting is a single URL used for both schemes.
    const settingProxy = workspaceConfigs.httpProxy;
    const httpProxy =
        settingProxy || process.env.HTTP_PROXY || process.env.http_proxy;
    const httpsProxy =
        settingProxy || process.env.HTTPS_PROXY || process.env.https_proxy;

    // Merge the `http.noProxy` setting (an array) with the comma-separated
    // NO_PROXY env var, deduping at host granularity.
    const envNoProxy = process.env.NO_PROXY || process.env.no_proxy || "";
    const noProxyParts = [
        ...workspaceConfigs.httpNoProxy,
        ...envNoProxy.split(","),
    ]
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
    const noProxy = [...new Set(noProxyParts)].join(",") || undefined;

    return {
        /* eslint-disable @typescript-eslint/naming-convention */
        HTTP_PROXY: httpProxy,
        HTTPS_PROXY: httpsProxy,
        NO_PROXY: noProxy,
        /* eslint-enable @typescript-eslint/naming-convention */
    };
}

export function getEnvVarsForCli(
    extensionContext: ExtensionContext,
    configfilePath?: string
) {
    /* eslint-disable @typescript-eslint/naming-convention */
    return {
        HOME: process.env.HOME,
        PATH: process.env.PATH,
        DATABRICKS_CONFIG_FILE:
            configfilePath ?? process.env.DATABRICKS_CONFIG_FILE,
        DATABRICKS_OUTPUT_FORMAT: "json",
        DATABRICKS_CLI_UPSTREAM: "databricks-vscode",
        DATABRICKS_CLI_UPSTREAM_VERSION: extensionVersion,
        ...getCLIDependenciesEnvVars(extensionContext),
    };
    /* eslint-enable @typescript-eslint/naming-convention */
}

export function getCLIDependenciesEnvVars(extensionContext: ExtensionContext) {
    if (!terraformMetadata) {
        return {};
    }
    /* eslint-disable @typescript-eslint/naming-convention */
    return {
        DATABRICKS_TF_VERSION: terraformMetadata.version,
        DATABRICKS_TF_EXEC_PATH: extensionContext.asAbsolutePath(
            terraformMetadata.execRelPath
        ),
        DATABRICKS_TF_PROVIDER_VERSION: terraformMetadata.providerVersion,
        DATABRICKS_TF_CLI_CONFIG_FILE: extensionContext.asAbsolutePath(
            terraformMetadata.terraformCliConfigRelPath
        ),
    };
    /* eslint-enable @typescript-eslint/naming-convention */
}

export function removeUndefinedKeys<
    T extends Record<string, string | undefined>,
>(envVarMap: T): Record<string, string> {
    const filteredEntries = Object.entries(envVarMap).filter(
        (entry) => entry[1] !== undefined
    ) as [string, string][];

    return Object.fromEntries<string>(filteredEntries);
}
