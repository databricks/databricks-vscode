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
import {logging} from "@databricks/sdk-experimental";
import {Loggers} from "../../logger";
import {workspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";

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

let systemCertificatesPromise: Promise<string[]> | undefined;

/**
 * Load and cache the OS certificate trust store (Windows/macOS/Linux) plus
 * Node's bundled CAs. Cached for the session; call {@link resetProxyAgentCaches}
 * in tests.
 */
async function getSystemCertificates(params: ProxyAgentParams) {
    if (!systemCertificatesPromise) {
        systemCertificatesPromise = loadSystemCertificates({
            loadSystemCertificatesFromNode:
                params.loadSystemCertificatesFromNode,
            log: params.log,
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

    const agentOptions: https.AgentOptions = {
        keepAlive: true,
        keepAliveMsecs: KEEP_ALIVE_MSECS,
        ...(isHttps ? {ca, rejectUnauthorized} : {}),
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
