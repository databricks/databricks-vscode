import fs from "node:fs";
import path from "node:path";
import type { HttpClient } from "@databricks/sdk-core/http";
import { setProduct } from "@databricks/sdk-core/clientinfo";
import type { Disposable } from "../platform/event";
import type { ContextKeys } from "../platform/contextKeys";
import { ExtensionDependencies, noExtensions, type ExtensionHost } from "../platform/extensions";
import type { Logger } from "../platform/log";
import type { ProcessRunner } from "../platform/process";
import { setting, type Settings } from "../platform/settings";
import type { StateStore } from "../platform/state";
import { MutableState, type State } from "../platform/reactive";
import { noFileEvents, type FileEvents } from "../platform/fileEvents";
import { noFileSearch, type FileSearch } from "../platform/fileSearch";
import { memoryTerminalEnv, type TerminalEnvCollection } from "../platform/terminalEnv";
import { readBundleFiles } from "./bundle/BundleFiles";
import { BundleLog, type BundleLogChannel } from "./bundle/BundleLog";
import { BundleService } from "./bundle/BundleService";
import { Cli } from "./cli/Cli";
import { ComputeService } from "./compute/ComputeService";
import { OVERRIDE_CLI_PATH, resolveCliPath } from "./cli/CliPaths";
import { childEnv } from "./cli/childEnv";
import { ConnectionService, identityOf } from "./connection/ConnectionService";
import { WorkspaceIdLedger } from "./connection/WorkspaceIds";
import { credentialSources } from "./connection";
import { HostMetadataCache } from "./connection/hostMetadata";
import { nodeHttpClient } from "./connection/nodeHttpClient";
import {
    OVERRIDE_CONFIG_FILE,
    Profiles,
    resolveConfigFile,
    type FileWatcher,
} from "./connection/Profiles";
import type { ChildEnvOptions, ExtensionInfo, Kernel } from "./feature";
import { capabilitiesOf, type Host } from "./host";
import { projectConnectionSource, ProjectService } from "./project";
import { hostMetadataReader } from "./project/hostMetadata";
import { TargetGuard } from "./project/TargetGuard";
import { UnityGatewayService } from "./unity-gateway/UnityGatewayService";

/** A session's config file, in the extension's storage: nothing creates it. */
const SESSION_CONFIG_FILE = "no-config-file-in-a-session-window";

/** VS Code's proxy settings, which children receive as `HTTP(S)_PROXY` and `NO_PROXY`. */
const HTTP_PROXY = setting<string>("http", "proxy", "");
const HTTP_NO_PROXY = setting<string[]>("http", "noProxy", []);
/** Read for each request by the transport, so a change applies without a reload. */
const HTTP_PROXY_STRICT_SSL = setting<boolean>("http", "proxyStrictSSL", true);

export interface KernelPlatform {
    readonly extension: ExtensionInfo;
    readonly state: StateStore;
    readonly settings: Settings;
    readonly contextKeys: ContextKeys;
    readonly runner: ProcessRunner;
    readonly log: Logger;
    /** The extension host's environment. */
    readonly env: Readonly<Record<string, string | undefined>>;
    /** Where the extension host runs (`detectHost`). Defaults to a local window. */
    readonly host?: Host;
    /** Running in Cursor, which stubs VS Code's Language Model API. */
    readonly isCursor?: boolean;
    readonly watch?: FileWatcher;
    /** The workspace folders' paths. Defaults to none. */
    readonly folders?: State<readonly string[]>;
    /** Watches the project's files. Defaults to watching nothing. */
    readonly files?: FileEvents;
    /** Searches the project's folder for sub-projects. Defaults to finding nothing. */
    readonly search?: FileSearch;
    /** The other installed extensions. Defaults to none. */
    readonly extensions?: ExtensionHost;
    readonly httpClient?: HttpClient;
    /** Creates the "Databricks Bundle Logs" channel. Defaults to a channel that drops everything. */
    readonly bundleLogChannel?: () => BundleLogChannel;
    /** Reveals the "Databricks Logs" channel. Defaults to doing nothing. */
    readonly showLog?: () => void;
    /** The terminals' environment. Defaults to one in memory. */
    readonly terminalEnvironment?: TerminalEnvCollection;
    /** How often the attached cluster is re-read while observed. Defaults to ten seconds. */
    readonly computePollIntervalMs?: number;
}

/** Builds the kernel services. Does no I/O: `start()` does. */
export function createKernel(platform: KernelPlatform): Kernel & Disposable & { start(): void } {
    const { extension, settings, env } = platform;
    // Names the extension in every in-process request's User-Agent. It throws on a version that isn't semver.
    try {
        setProduct("databricks-vscode", extension.version);
    } catch (error) {
        platform.log.warn(
            `Invalid extension version for User-Agent: ${extension.version}`,
            error as Error,
        );
    }
    const host = platform.host ?? { kind: "local" };
    const capabilities = capabilitiesOf(host, { isCursor: platform.isCursor ?? false });
    const cliPath = () => resolveCliPath(settings, (p) => extension.asAbsolutePath(p));
    const cli = new Cli(platform.runner, cliPath, platform.log.child("cli"), () =>
        Boolean(settings.get(OVERRIDE_CLI_PATH)),
    );
    // A session window reads no profiles, and its children get a config file
    // that doesn't exist: its `[__settings__] default_profile` would otherwise
    // send a target without a host, and the session's token, to that
    // profile's workspace (2.x's #2236).
    const configFile =
        host.kind === "session"
            ? () => path.join(extension.globalStoragePath, SESSION_CONFIG_FILE)
            : () => resolveConfigFile(settings.get(OVERRIDE_CONFIG_FILE), env);

    let connection: ConnectionService | undefined;
    let guard: TargetGuard | undefined;
    const buildEnv = (options: ChildEnvOptions = {}) => {
        const current =
            options.connection === null
                ? undefined
                : (options.connection ?? connection?.connection);
        if (options.bundle !== undefined) {
            // Where the token joins a bundle call: the guard has the last word.
            if (guard === undefined) {
                throw new Error("The target guard isn't ready");
            }
            guard.assertUsable(options.bundle.root, options.bundle.target);
        }
        return childEnv({
            base: env,
            configFile: configFile(),
            connection: current?.child,
            cliPath: cliPath(),
            proxy: { httpProxy: settings.get(HTTP_PROXY), noProxy: settings.get(HTTP_NO_PROXY) },
            ...(options.environment !== undefined ? { environment: options.environment } : {}),
            ...(options.cli ? { cli: { extensionVersion: extension.version } } : {}),
            bundleVariables: options.bundleVariables,
            compute: options.compute,
            ...(options.bundle !== undefined ? { bundleRoot: options.bundle.root } : {}),
        });
    };

    const profiles = new Profiles(configFile, platform.watch ?? watchFile);
    const files = platform.files ?? noFileEvents;
    const extensionDependencies = new ExtensionDependencies(
        platform.extensions ?? noExtensions,
        platform.log.child("extensions"),
    );
    const project = new ProjectService({
        // Detection is the same on every host; the target guard decides what may run.
        folders: platform.folders ?? new MutableState<readonly string[]>([]),
        files,
        search: platform.search ?? noFileSearch,
        state: platform.state,
        log: platform.log.child("project"),
    });
    const projectSource = projectConnectionSource(project);
    const sources = credentialSources({
        cli,
        runner: platform.runner,
        // `auth token` and `az` ran with the host env in 2.22.0, without http.proxy.
        env: () => buildEnv({ connection: null, cli: true, environment: "inherited" }),
    });
    // Every in-process request goes through this one transport, as in 2.22.0, so VS Code's proxy
    // and certificate settings apply to all of them.
    const httpClient =
        platform.httpClient ??
        nodeHttpClient({ rejectUnauthorized: () => settings.get(HTTP_PROXY_STRICT_SSL) });
    const hostMetadata = new HostMetadataCache(httpClient, platform.log.child("hostMetadata"));
    const workspaces = new WorkspaceIdLedger(platform.state);
    connection = new ConnectionService({
        project: projectSource,
        profiles,
        state: platform.state,
        env,
        identity: identityOf(host),
        // Local windows record; session windows only read, through their target guard.
        ...(host.kind === "session" ? {} : { workspaces }),
        sources,
        log: platform.log.child("connection"),
        httpClient,
        hostMetadata,
    });
    const unityGateway = new UnityGatewayService({
        profiles,
        state: platform.state,
        sources,
        available: capabilities.unityGateway,
        log: platform.log.child("unityGateway"),
        httpClient,
        hostMetadata,
    });

    const targetGuard = new TargetGuard({
        policy:
            capabilities.projects === "sessionWorkspace" && host.kind === "session"
                ? { kind: "sessionWorkspace", host: host.host }
                : { kind: "anyTarget" },
        project: project.snapshot,
        connection: connection.state,
        readFiles: readBundleFiles,
        metadata: hostMetadataReader(httpClient, platform.log.child("hostMetadata")),
        bundleFileChanged: project.onBundleFileChanged,
        detectionEnded: project.onDetectionEnded,
        recorded: () => workspaces.read(),
        log: platform.log.child("targetGuard"),
    });
    guard = targetGuard;

    const bundleLog = new BundleLog(platform.bundleLogChannel ?? (() => silentChannel));
    const bundle = new BundleService({
        project: project.snapshot,
        connection: connection.state,
        access: targetGuard.state,
        cli,
        env: (c, inputs) =>
            buildEnv({
                connection: c,
                cli: true,
                bundleVariables: inputs.variables,
                ...(inputs.clusterId !== undefined
                    ? { compute: { kind: "cluster", clusterId: inputs.clusterId } }
                    : {}),
                bundle: { root: inputs.root, target: inputs.target },
            }),
        choosesCompute: capabilities.compute === "perTarget",
        log: platform.log.child("bundle"),
        bundleLog,
    });

    const compute = new ComputeService({
        project: project.snapshot,
        saveOverrides: (patch) => project.saveOverrides(patch),
        validated: bundle.validated,
        connection: connection.state,
        settings,
        log: platform.log.child("compute"),
        ...(platform.computePollIntervalMs !== undefined
            ? { pollIntervalMs: platform.computePollIntervalMs }
            : {}),
        ...(host.kind === "session" && host.compute !== undefined ? { session: host.compute } : {}),
        defaultServerless: capabilities.identity === "profiles",
        choosesCompute: capabilities.compute === "perTarget",
    });

    return {
        extension,
        state: platform.state,
        settings,
        contextKeys: platform.contextKeys,
        files,
        extensionDependencies,
        cli,
        processes: platform.runner,
        connection,
        unityGateway,
        project,
        targetAccess: targetGuard.state,
        bundle,
        bundleLog,
        compute,
        capabilities,
        showLog: () => platform.showLog?.(),
        terminalEnvironment: platform.terminalEnvironment ?? memoryTerminalEnv(),
        configFile,
        childEnv: buildEnv,
        /** Detects the project, and resolves the connection once it has. */
        start: () => {
            project.start();
            connection?.start();
            // After the connection, which starts loading the profiles.
            unityGateway.start();
            targetGuard.start();
            bundle.start();
            compute.start();
        },
        dispose: () => {
            compute.dispose();
            targetGuard.dispose();
            bundle.dispose();
            bundleLog.dispose();
            unityGateway.dispose();
            connection?.dispose();
            projectSource.dispose();
            project.dispose();
            profiles.dispose();
            extensionDependencies.dispose();
        },
    };
}

const silentChannel: BundleLogChannel = {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    show: () => {},
    dispose: () => {},
};

/**
 * Polls the file's metadata. Unlike `fs.watch`, it works for a file that
 * doesn't exist yet and survives the file being replaced, which is how the
 * CLI writes it.
 */
const watchFile: FileWatcher = (file, onChange) => {
    const listener = (curr: fs.Stats, prev: fs.Stats) => {
        if (curr.mtimeMs !== prev.mtimeMs || curr.size !== prev.size) {
            onChange();
        }
    };
    fs.watchFile(file, { interval: 1000, persistent: false }, listener);
    return { dispose: () => fs.unwatchFile(file, listener) };
};
