import * as http from "node:http";
import * as https from "node:https";
import * as tls from "node:tls";
import {readFile} from "node:fs/promises";
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
const DEFAULT_HTTP_TIMEOUT_SECONDS = 5;

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
 * intentionally disabled (`useHostProxy: false`) — it needs Electron's proxy
 * resolver, which the extension host doesn't expose.
 */
function getProxyAgentParams(): ProxyAgentParams {
    const log = getLog();
    return {
        resolveProxy: async () => undefined,
        getProxyURL: () => workspaceConfigs.httpProxy,
        getProxySupport: () => "on",
        getNoProxyConfig: () => mergeNoProxy(),
        isAdditionalFetchSupportEnabled: () => false,
        addCertificatesV1: () => false,
        addCertificatesV2: () => true,
        loadAdditionalCertificates: async () => [],
        log,
        getLogLevel: () => LogLevel.Error,
        proxyResolveTelemetry: () => {},
        useHostProxy: false,
        env: process.env,
    };
}

/**
 * Merge the `http.noProxy` VS Code setting (an array) with the comma-separated
 * `NO_PROXY`/`no_proxy` env var into a deduped host list. The two are *unioned*
 * (not overridden) since a bypass list is only ever safer when it's broader.
 * Shared by the in-process SDK proxy resolver here and the CLI env-var builder
 * (`getProxyEnvVars` in envVarGenerators.ts) so both resolve the same list.
 */
export function mergeNoProxy(): string[] {
    const envNoProxy = process.env.NO_PROXY || process.env.no_proxy || "";
    const noProxyParts = [
        ...workspaceConfigs.httpNoProxy,
        ...envNoProxy.split(","),
    ]
        .map((v) => v.trim())
        .filter((v) => v.length > 0);

    return [...new Set(noProxyParts)];
}

let systemCertificatesPromise: Promise<string[] | undefined> | undefined;

// The system-certificate reader, indirected through a module-level binding so
// tests can simulate an unreadable OS store. @vscode/proxy-agent's own reader
// catches internally and reads the host machine's real store, so there's no
// other seam to force the failure path.
let loadSystemCertificatesImpl: (params: {log: Log}) => Promise<string[]> =
    loadSystemCertificates;

/**
 * Load and cache the OS certificate trust store. Cached for the session; call
 * {@link resetProxyAgentCaches} in tests.
 *
 * Returns `undefined` (never a rejected promise) when the store can't be read.
 * @vscode/proxy-agent reads it via native readers: `security` on macOS and PEM
 * bundle files on Linux, which work out of the box. On Windows the store is read
 * through the native `@vscode/windows-ca-certs` addon — which we deliberately do
 * *not* ship (it publishes no prebuilds and can't be cross-compiled on the Linux
 * release runner), so on Windows that read throws and we fall back here. When the
 * read fails we swallow it so the caller uses Node's bundled roots instead of
 * failing the whole SDK request. Windows users behind an internal CA point
 * `databricks.proxy.caCert` at their PEM (or opt out via
 * `databricks.proxy.strictSSL`): a missing custom CA is recoverable, a broken
 * agent is not.
 */
async function getSystemCertificates(
    params: ProxyAgentParams
): Promise<string[] | undefined> {
    if (!systemCertificatesPromise) {
        systemCertificatesPromise = loadSystemCertificatesImpl({
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
 * Override the system-certificate loader (and drop the cache). Test-only: lets
 * tests exercise the "OS store unreadable" fallback without depending on the
 * host machine's real trust store. Pass `undefined` to restore the default.
 */
export function setSystemCertificatesLoaderForTests(
    loader?: (params: {log: Log}) => Promise<string[]>
) {
    loadSystemCertificatesImpl = loader ?? loadSystemCertificates;
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
 * Read the user-configured `databricks.proxy.caCert` PEM bundle, if set. Returns
 * `undefined` when the setting is empty or the file can't be read — a bad path
 * shouldn't break every TLS handshake, so we log and fall back to the rest of
 * the trust store.
 */
async function loadConfiguredCaCert(): Promise<string | undefined> {
    const caCertPath = workspaceConfigs.proxyCaCert;
    if (!caCertPath) {
        return undefined;
    }
    try {
        return await readFile(caCertPath, "utf8");
    } catch (e) {
        getLog().error(
            `Failed to read databricks.proxy.caCert from "${caCertPath}"; ` +
                "ignoring it. The certificate it points at will not be trusted.",
            e
        );
        return undefined;
    }
}

/**
 * Assemble the CA trust list for the SDK's HTTPS agent, or `undefined` to leave
 * Node's default store in place.
 *
 * Any list we build is anchored on `tls.rootCertificates` (Node's bundled public
 * roots) and then extended with the OS trust store and the configured PEM.
 * Setting `ca` *replaces* Node's defaults, so if we set it to only the extra
 * certs, public-root TLS would break — hence the merge. When we have nothing to
 * add (system store unreadable and no `caCert`), return `undefined` so the
 * caller omits `ca` and Node keeps its defaults.
 *
 * Deduped because the OS store commonly re-lists the public roots already in
 * `tls.rootCertificates`; a `Set` keeps the handed-off list minimal.
 */
function buildCaBundle(
    systemCerts: string[] | undefined,
    configuredCaCert: string | undefined
): string[] | undefined {
    // @vscode/proxy-agent swallows a failed OS-store read and returns `[]`, so
    // treat empty the same as unreadable: nothing to add on top of Node's
    // bundled roots.
    if (!systemCerts?.length && !configuredCaCert) {
        return undefined;
    }
    return [
        ...new Set([
            ...tls.rootCertificates,
            ...(systemCerts ?? []),
            ...(configuredCaCert ? [configuredCaCert] : []),
        ]),
    ];
}

/**
 * Build the HTTP(S) agent the Databricks SDK should use, wiring in the proxy
 * (VS Code `http.proxy` setting + `http(s)_proxy` env vars, honouring
 * `NO_PROXY`) and the OS certificate trust store. This is what lets the
 * in-process SDK calls work behind corporate proxies and internal-CA TLS
 * interception, matching the bundled CLI's behaviour.
 */
export async function getDatabricksHttpAgent(
    host: URL,
    httpTimeoutSeconds?: number
): Promise<http.Agent | https.Agent> {
    const params = getProxyAgentParams();
    const isHttps = host.protocol === "https:";

    // Independent reads (OS trust store vs the configured PEM) — run them
    // together rather than serially.
    const [systemCerts, configuredCaCert] = await Promise.all([
        getSystemCertificates(params),
        loadConfiguredCaCert(),
    ]);
    const ca = buildCaBundle(systemCerts, configuredCaCert);
    const rejectUnauthorized = strictSSL();

    const resolver = createProxyResolver(params);
    const proxyUrl = await resolver.resolveProxyURL(host.toString());

    // Only set `ca` when we have certs to add on top of Node's bundled roots
    // (which `buildCaBundle` already folds in). On the fallback path `ca` is
    // `undefined`, so we omit it entirely and Node keeps its default store —
    // passing `undefined`/`[]` would instead trust nothing.
    const agentOptions: https.AgentOptions = {
        keepAlive: true,
        keepAliveMsecs: KEEP_ALIVE_MSECS,
        timeout: (httpTimeoutSeconds || DEFAULT_HTTP_TIMEOUT_SECONDS) * 1000,
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
    const agent = await getDatabricksHttpAgent(host, config.httpTimeoutSeconds);
    return new WorkspaceClient(config, {
        product: "databricks-vscode",
        productVersion: extensionVersion,
        agent,
    });
}
