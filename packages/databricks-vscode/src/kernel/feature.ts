import type {
    CommandHandler,
    CommandOptions,
    CommandRegistry,
    InternalCommand,
    ScopeName,
} from "../platform/commands";
import type { ContextKey, ContextKeys, ContextValue } from "../platform/contextKeys";
import { disposeAll, type Disposable } from "../platform/event";
import { UserFacingError } from "../platform/errors";
import type { ExtensionDependencies } from "../platform/extensions";
import type { Logger } from "../platform/log";
import type { ProcessRunner } from "../platform/process";
import type { State } from "../platform/reactive";
import type { Settings } from "../platform/settings";
import type { StateStore } from "../platform/state";
import type { ConfigurationSections } from "../platform/ui/sections";
import type { FileEvents } from "../platform/fileEvents";
import type { TerminalEnvCollection } from "../platform/terminalEnv";
import type { BundleLog } from "./bundle/BundleLog";
import type { BundleService } from "./bundle/BundleService";
import type { Cli } from "./cli/Cli";
import type { ComputeService } from "./compute/ComputeService";
import type { ChildCompute, ChildEnvironment } from "./cli/childEnv";
import type { Connection, ConnectionService } from "./connection/ConnectionService";
import type { HostCapabilities } from "./host/capabilities";
import type { Host } from "./host/Host";
import type { Project, ProjectService } from "./project/ProjectService";
import type { TargetAccessState } from "./project/TargetGuard";
import type { UnityGatewayService } from "./unity-gateway/UnityGatewayService";
import type { EventProperties, TelemetryEvent, TelemetryRecorder } from "./telemetry";

/** Facts about the installed extension. */
export interface ExtensionInfo {
    readonly id: string;
    readonly version: string;
    /** The extension's `logUri`, as a path. */
    readonly logPath: string;
    asAbsolutePath(relativePath: string): string;
    /** The CLI version this build pins (`cli.version` in `package.json`). */
    readonly cliVersion?: string;
    /** Running from source, in an Extension Development Host. */
    readonly isDevelopment: boolean;
    /** The extension's `globalStorageUri`, as a path: caches that outlive a window. */
    readonly globalStoragePath: string;
}

export interface ChildEnvOptions {
    /**
     * Defaults to the current connection; `null` means signed out, as while
     * creating a profile. Another profile's `child` gives a child that profile.
     */
    readonly connection?: Pick<Connection, "child"> | null;
    /** Adds the variables the Databricks CLI expects. */
    readonly cli?: boolean;
    /**
     * Which 2.22.0 environment the certificate and proxy variables match
     * (`childEnv`). Defaults to `cli` for `cli: true`, else `hostAndProxy`.
     */
    readonly environment?: ChildEnvironment;
    /**
     * Adds `BUNDLE_VAR_<name>` for each override, for bundle CLI calls.
     * Usually `project.variables.value`, the active target's.
     */
    readonly bundleVariables?: Readonly<Record<string, string>>;
    /** Adds `DATABRICKS_CLUSTER_ID` or `DATABRICKS_SERVERLESS_COMPUTE_ID=auto`. */
    readonly compute?: ChildCompute;
    /**
     * The project's root, which a bundle CLI call pins, so the CLI can't walk
     * up to a parent `databricks.yml`. The bundle calls that check the target
     * come from `bundleChildEnv`.
     */
    readonly bundleRoot?: string;
}

/** The shared services. */
export interface Kernel {
    readonly extension: ExtensionInfo;
    readonly state: StateStore;
    readonly settings: Settings;
    readonly contextKeys: ContextKeys;
    /** Watches files in the workspace, such as a project's marker files. */
    readonly files: FileEvents;
    /** The other extensions this one relies on (`kernel/extensionDependencies.ts`), which may be missing or disabled. */
    readonly extensionDependencies: ExtensionDependencies;
    readonly cli: Cli;
    /** Child processes other than the CLI, such as pip (`platform/process`). Give them `childEnv()`. */
    readonly processes: ProcessRunner;
    readonly connection: ConnectionService;
    /** The Unity Gateway sign-in, separate from `connection`. */
    readonly unityGateway: UnityGatewayService;
    readonly project: ProjectService;
    /**
     * Whether the active target's bundle commands may run here: always in a
     * local window; in a session window, only for a target in the session's
     * workspace (`targetAccess`).
     */
    readonly targetAccess: State<TargetAccessState>;
    /** Validate and summary of the active target. */
    readonly bundle: BundleService;
    /** The "Databricks Bundle Logs" channel. */
    readonly bundleLog: BundleLog;
    /** The effective compute, the attached cluster and the cluster list. */
    readonly compute: ComputeService;
    /**
     * What the extension can do where its host runs (`kernel/host/`): a local
     * window, or a session window on Databricks compute. Features read this,
     * never where they run.
     */
    readonly capabilities: HostCapabilities;
    /** Reveals the "Databricks Logs" channel, for "Show Logs" actions. */
    showLog(): void;
    /** The extension's `environmentVariableCollection`: what integrated terminals inherit. */
    readonly terminalEnvironment: TerminalEnvCollection;
    /** The resolved config file (AUTH-07). */
    configFile(): string;
    /** The environment of a child process (`childEnv`). */
    childEnv(options?: ChildEnvOptions): Record<string, string>;
    /**
     * The environment of a bundle call, as `childEnv` with `bundle`. It first
     * decides the target from the files on disk, so a bundle command started
     * right after an edit is refused. Resolves once that passes.
     */
    bundleChildEnv(
        options: ChildEnvOptions & {
            readonly bundle: { readonly root: string; readonly target: string };
        },
    ): Promise<Record<string, string>>;
}

/** Commands registered through it are disposed with the feature. */
export interface FeatureCommands {
    register<S extends ScopeName = "window">(
        id: string,
        handler: CommandHandler<S>,
        options?: CommandOptions<S>,
    ): void;
    /** Registers a command other features run through `execute`. */
    registerInternal<A, R>(
        command: InternalCommand<A, R>,
        handler: (arg: A) => R | Promise<R>,
    ): void;
    /**
     * Runs another feature's internal command. Undefined means it was
     * cancelled, or failed and showed its error.
     */
    execute<A, R>(command: InternalCommand<A, R>, arg: A): Promise<R | undefined>;
    /**
     * Shows an error that no command can throw, as from a listener or a
     * background task, the way a failed command's is shown: the message, and
     * its actions as buttons. Resolves when dismissed or the action has run.
     */
    showError(error: UserFacingError): Promise<void>;
}

/**
 * The active bundle project and its target. The connection isn't
 * part of it: the project's rows must render while signed out too.
 */
export interface ProjectSession {
    readonly project: Project;
    /** Undefined when the bundle has several targets and none is chosen. */
    readonly target?: string;
}

export interface FeatureContext {
    readonly kernel: Kernel;
    readonly commands: FeatureCommands;
    readonly sections: ConfigurationSections;
    readonly telemetry: TelemetryRecorder;
    /** Tagged with the feature's id. */
    readonly log: Logger;
    readonly subscriptions: Disposable[];
    /**
     * Runs `start` for each connection, and disposes what it returns when that
     * connection ends: on sign-out, on an error, or when another replaces it.
     */
    whileConnected(start: (connection: Connection) => Disposable | void): void;
    /**
     * Runs `start` for each project session, and disposes what it returns
     * when the project or its target changes, or the project goes away.
     */
    whileProjectSession(start: (session: ProjectSession) => Disposable | void): void;
}

/**
 * How a contributed command or view behaves in a session window, whose
 * extension host runs on Databricks compute (`kernel/host/`):
 * - `same`: as in a local window;
 * - `adapted`: differently, as the text says;
 * - `unavailable`: not at all. Say why, and what to do instead: in a
 *   session window the registry refuses the command with both, instead of
 *   running it, and its enablement or `when` hides it.
 */
export type SessionSupport =
    | "same"
    | { readonly adapted: string }
    | { readonly unavailable: string; readonly instead: string };

/**
 * A feature module. Features never import each other; they
 * are listed in `features.ts`.
 */
export interface Feature {
    readonly id: string;
    /** Checked against the when-clauses in `package.json`. */
    readonly contextKeys?: readonly ContextKey<ContextValue>[];
    /** Feeds `telemetry.json`. */
    readonly telemetryEvents?: readonly TelemetryEvent<EventProperties | undefined>[];
    /**
     * How each command and view the feature contributes behaves in a session
     * window, by ID; internal commands may have an entry too.
     * `test/contract/hosts.test.ts` checks it against what `register()`
     * registers and against `package.json`.
     */
    readonly session?: Readonly<Record<string, SessionSupport>>;
    /** Registers commands, views and providers. Must do no I/O. */
    register(ctx: FeatureContext): void;
    /**
     * Runs once every feature is registered, without blocking activation.
     * May do I/O. Errors are logged.
     */
    start?(ctx: FeatureContext): void | Promise<void>;
}

export interface FeatureHost {
    readonly kernel: Kernel;
    readonly registry: CommandRegistry;
    readonly sections: ConfigurationSections;
    readonly telemetry: TelemetryRecorder;
    readonly log: Logger;
    /** Where the extension host runs; in a session window, `Feature.session` applies. Defaults to a local window. */
    readonly host?: Host;
}

export interface RegisteredFeature {
    readonly feature: Feature;
    readonly ctx: FeatureContext;
    /** The command IDs the feature registered. */
    readonly commandIds: readonly string[];
    readonly error?: unknown;
}

/**
 * Registers each feature in order. A feature that throws is logged and
 * skipped, so it can't take the others down.
 */
export function registerFeatures(
    features: readonly Feature[],
    host: FeatureHost,
): RegisteredFeature[] {
    return features.map((feature) => {
        const subscriptions: Disposable[] = [];
        const commandIds: string[] = [];
        const log = host.log.child(feature.id);
        const ctx: FeatureContext = {
            kernel: host.kernel,
            sections: host.sections,
            telemetry: host.telemetry,
            log,
            subscriptions,
            whileConnected: (start) => {
                subscriptions.push(bindToConnection(host.kernel.connection, start, log));
            },
            whileProjectSession: (start) => {
                subscriptions.push(bindToProjectSession(host.kernel.project, start, log));
            },
            commands: {
                register: <S extends ScopeName = "window">(
                    id: string,
                    handler: CommandHandler<S>,
                    options?: CommandOptions<S>,
                ) => {
                    const refusal = unavailableHere(feature, id, host.host);
                    subscriptions.push(
                        refusal === undefined
                            ? host.registry.register<S>(id, handler, options)
                            : host.registry.register(id, refusal),
                    );
                    commandIds.push(id);
                },
                registerInternal: (command, handler) => {
                    const refusal = unavailableHere(feature, command.id, host.host);
                    subscriptions.push(host.registry.register(command.id, refusal ?? handler));
                    commandIds.push(command.id);
                },
                execute: (command, arg) => host.registry.executeInternal(command, arg),
                showError: (error) => host.registry.showError(error),
            },
        };
        try {
            feature.register(ctx);
            return { feature, ctx, commandIds };
        } catch (error) {
            host.log.error(`Feature ${feature.id} failed to register`, error);
            disposeAll(subscriptions);
            return { feature, ctx, commandIds, error };
        }
    });
}

/**
 * In a session window, the handler that replaces a command the feature
 * declares unavailable there: it fails with the declaration's reason and
 * what to do instead, without the command's scope, so every way to run it
 * (a menu, a keybinding, another extension, a feature's own call) gets the
 * same answer. Undefined elsewhere, and for every other command.
 */
function unavailableHere(
    feature: Feature,
    id: string,
    host: Host | undefined,
): (() => never) | undefined {
    const support = host?.kind === "session" ? feature.session?.[id] : undefined;
    if (support === undefined || support === "same" || "adapted" in support) {
        return undefined;
    }
    return () => {
        throw new UserFacingError(
            "UNAVAILABLE_IN_SESSION",
            `${support.unavailable} ${support.instead}`,
        );
    };
}

export function startFeatures(registered: readonly RegisteredFeature[]): void {
    for (const { feature, ctx, error } of registered) {
        if (error !== undefined || feature.start === undefined) {
            continue;
        }
        Promise.resolve()
            .then(() => feature.start?.(ctx))
            .catch((e: unknown) => {
                ctx.log.error(`Feature ${feature.id} failed to start`, e);
            });
    }
}

/** The scope-bound lifetime behind `whileConnected`. */
export function bindToConnection(
    service: Pick<ConnectionService, "state" | "connection">,
    start: (connection: Connection) => Disposable | void,
    log: Logger,
): Disposable {
    let current: Connection | undefined;
    let resource: Disposable | void;
    const update = () => {
        const next = service.connection;
        // The same `api` is the same connection, even if its reason changed.
        if (next?.api === current?.api) {
            current = next;
            return;
        }
        resource?.dispose();
        resource = undefined;
        current = next;
        if (next !== undefined) {
            try {
                resource = start(next);
            } catch (e) {
                log.error("A connection-scoped start failed", e);
            }
        }
    };
    const subscription = service.state.onDidChange(update);
    update();
    return {
        dispose: () => {
            subscription.dispose();
            resource?.dispose();
            current = undefined;
        },
    };
}

/** The scope-bound lifetime behind `whileProjectSession`. */
export function bindToProjectSession(
    service: Pick<ProjectService, "active" | "target">,
    start: (session: ProjectSession) => Disposable | void,
    log: Logger,
): Disposable {
    let current: ProjectSession | undefined;
    let resource: Disposable | void;
    const update = () => {
        const project = service.active.value;
        const target = service.target.value;
        if (current?.project === project && current?.target === target) {
            return;
        }
        resource?.dispose();
        resource = undefined;
        current = project === undefined ? undefined : { project, target };
        if (current !== undefined) {
            try {
                resource = start(current);
            } catch (e) {
                log.error("A project-scoped start failed", e);
            }
        }
    };
    const subscriptions = [service.active.onDidChange(update), service.target.onDidChange(update)];
    update();
    return {
        dispose: () => {
            subscriptions.forEach((s) => s.dispose());
            resource?.dispose();
            current = undefined;
        },
    };
}
