import * as http from "node:http";
import * as https from "node:https";
import {
    createProxyResolver,
    loadSystemCertificates,
    LogLevel,
    type Log,
    type ProxyAgentParams,
} from "@vscode/proxy-agent";
import {HttpProxyAgent} from "http-proxy-agent";
import {HttpsProxyAgent} from "https-proxy-agent";
import {
    logging,
    ProductVersion,
    WorkspaceClient,
} from "@databricks/sdk-experimental";
import {Loggers} from "../../logger";
import {workspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const extensionVersion = require("../../../package.json")
    .version as ProductVersion;

// Mirror the SDK's own default agent tuning (see @databricks/sdk-experimental
// api-client.js ApiClient.getAgent), so behaviour is unchanged apart from the
// proxy + CA wiring we add on top.
const KEEP_ALIVE_MSECS = 15000;

function getLog(): Log {
    const logger = logging.NamedLogger.getOrCreate(Loggers.Extension);
    return {
        trace: (message, ...args) => logger.debug(message, args),
        debug: (message, ...args) => logger.debug(message, args),
        info: (message, ...args) => logger.info(message, args),
        warn: (message, ...args) => logger.warn(message, args),
        error: (message, ...args) =>
            logger.error(
                message instanceof Error ? message.message : message,
                args
            ),
    };
}

/**
 * Build the params @vscode/proxy-agent needs to resolve a proxy the same way
 * VS Code core does: `http.proxy` setting first, then the `http(s)_proxy` env
 * vars, honouring `http.noProxy` and `NO_PROXY`. System/PAC auto-detection is
 * intentionally disabled (`isUseHostProxyEnabled: false`) — it needs Electron's
 * proxy resolver, which the extension host doesn't expose.
 */
function getProxyAgentParams(): ProxyAgentParams {
    const log = getLog();
    return {
        resolveProxy: async () => undefined,
        getProxyURL: () => workspaceConfigs.httpProxy,
        getProxySupport: () => "on",
        getNoProxyConfig: () => workspaceConfigs.httpNoProxy,
        isAdditionalFetchSupportEnabled: () => false,
        isWebSocketPatchEnabled: () => false,
        addCertificatesV1: () => false,
        addCertificatesV2: () => true,
        loadSystemCertificatesFromNode: () => true,
        loadAdditionalCertificates: async () => [],
        log,
        getLogLevel: () => LogLevel.Error,
        proxyResolveTelemetry: () => {},
        isUseHostProxyEnabled: () => false,
        env: process.env,
    };
}

let systemCertificatesPromise: Promise<string[] | undefined> | undefined;

/**
 * Load and cache the OS certificate trust store (Windows/macOS/Linux) plus
 * Node's bundled CAs. Cached for the session; call {@link resetProxyAgentCaches}
 * in tests.
 *
 * Returns `undefined` (never a rejected/empty promise) when the store can't be
 * read. @vscode/proxy-agent reads it via Node's `tls.getCACertificates`, which
 * only exists on Node >= 22.15; on the older runtimes some supported VS Code
 * builds still ship, that call throws. Swallowing it here lets the caller fall
 * back to Node's bundled roots instead of failing the whole SDK request — a
 * missing custom CA is recoverable (users can set `databricks.proxy.strictSSL`),
 * a broken agent is not.
 */
async function getSystemCertificates(
    params: ProxyAgentParams
): Promise<string[] | undefined> {
    if (!systemCertificatesPromise) {
        systemCertificatesPromise = loadSystemCertificates({
            loadSystemCertificatesFromNode:
                params.loadSystemCertificatesFromNode,
            log: params.log,
        }).catch((e) => {
            params.log.error(
                "Failed to load system certificates; falling back to Node's " +
                    "bundled CAs. Custom/corporate CAs may not be trusted.",
                e
            );
            // Don't cache the rejection — leave the promise unset so a later
            // call can retry.
            systemCertificatesPromise = undefined;
            return undefined;
        });
    }
    return systemCertificatesPromise;
}

/** Reset the cached system certificates. Test-only. */
export function resetProxyAgentCaches() {
    systemCertificatesPromise = undefined;
}

/**
 * Whether the SDK must verify TLS certificates. `false` only when the user
 * opted out via `databricks.proxy.strictSSL` or `http.proxyStrictSSL`.
 */
export function strictSSL(): boolean {
    return workspaceConfigs.proxyStrictSSL;
}

/**
 * Keep the SDK's own fetch path (fetch.js reads DATABRICKS_SDK_PROXY_STRICT_SSL)
 * and the bundled CLI subprocess consistent with the injected agent's
 * `rejectUnauthorized`.
 */
export function applyProxyStrictSSLEnv() {
    if (strictSSL()) {
        delete process.env.DATABRICKS_SDK_PROXY_STRICT_SSL;
    } else {
        process.env.DATABRICKS_SDK_PROXY_STRICT_SSL = "false";
    }
}

/**
 * Build the HTTP(S) agent the Databricks SDK should use, wiring in the proxy
 * (VS Code `http.proxy` setting + `http(s)_proxy` env vars, honouring
 * `NO_PROXY`) and the OS certificate trust store. This is what lets the
 * in-process SDK calls work behind corporate proxies and internal-CA TLS
 * interception, matching the bundled CLI's behaviour.
 */
export async function getDatabricksHttpAgent(
    host: URL
): Promise<http.Agent | https.Agent> {
    const params = getProxyAgentParams();
    const isHttps = host.protocol === "https:";

    const ca = await getSystemCertificates(params);
    const rejectUnauthorized = strictSSL();

    const resolver = createProxyResolver(params);
    const proxyUrl = await resolver.resolveProxyURL(host.toString());

    // Only override `ca` when we actually loaded a trust store. Passing `ca:
    // undefined` (or `[]`) would replace Node's bundled roots with nothing and
    // break every TLS handshake, so omit it entirely on the fallback path.
    const agentOptions: https.AgentOptions = {
        keepAlive: true,
        keepAliveMsecs: KEEP_ALIVE_MSECS,
        ...(isHttps ? {rejectUnauthorized, ...(ca ? {ca} : {})} : {}),
    };

    if (proxyUrl) {
        return isHttps
            ? new HttpsProxyAgent(proxyUrl, agentOptions)
            : new HttpProxyAgent(proxyUrl, agentOptions);
    }

    return isHttps
        ? new https.Agent(agentOptions)
        : new http.Agent(agentOptions);
}

// The config shape the WorkspaceClient constructor accepts (ConfigOptions | Config),
// derived from the constructor so we don't depend on ConfigOptions — the SDK index
// doesn't re-export it.
type WorkspaceClientConfig = ConstructorParameters<typeof WorkspaceClient>[0];

/**
 * Construct a WorkspaceClient wired for the extension's network environment.
 *
 * The SDK pins its own agent per request, bypassing VS Code's global proxy/CA
 * patching. This injects a proxy- and system-CA-aware agent (and keeps the SDK
 * fetch path and bundled-CLI subprocess consistent via the strict-SSL env) so
 * in-process SDK calls work behind corporate proxies and internal-CA TLS
 * interception, matching the bundled CLI's behaviour. This is the only place
 * the extension should build a WorkspaceClient.
 */
export async function createWorkspaceClient(
    config: WorkspaceClientConfig,
    host: URL
): Promise<WorkspaceClient> {
    applyProxyStrictSSLEnv();
    const agent = await getDatabricksHttpAgent(host);
    return new WorkspaceClient(config, {
        product: "databricks-vscode",
        productVersion: extensionVersion,
        agent,
    });
}
