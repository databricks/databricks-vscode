import type { ConfigurationChangeEvent, Memento } from "vscode";
import { createKernel, type KernelPlatform } from "../kernel/createKernel";
import type { FeatureHost, Kernel } from "../kernel/feature";
import type { Host } from "../kernel/host";
import { Telemetry, type TelemetryReporter } from "../kernel/telemetry/Telemetry";
import { CommandRegistry, type CommandExecution } from "../platform/commands";
import { ContextKeys } from "../platform/contextKeys";
import { UserFacingError } from "../platform/errors";
import { Log, type LogEntry, type LogSink } from "../platform/log";
import { Settings } from "../platform/settings";
import { StateStore } from "../platform/state";
import { ConfigurationSections } from "../platform/ui/sections";
import { vscodeExtensions } from "../platform/workspace";
import { FakeProcessRunner } from "./fakeCli";
import { globFileSearch } from "./fileSearch";
import { FakeHttpClient } from "./fakeHttp";
import { commands, window } from "./vscode";

/** An in-memory `Memento`. */
export function fakeMemento(): Memento & { store: Map<string, unknown> } {
    const store = new Map<string, unknown>();
    return {
        store,
        keys: () => [...store.keys()],
        get: <T>(key: string, defaultValue?: T) =>
            (store.has(key) ? store.get(key) : defaultValue) as T,
        update: async (key: string, value: unknown) => {
            if (value === undefined) {
                store.delete(key);
            } else {
                store.set(key, value);
            }
        },
    } as Memento & { store: Map<string, unknown> };
}

/** A log that keeps its entries. */
export function fakeLog(): Log & { entries: LogEntry[] } {
    const entries: LogEntry[] = [];
    const sink: LogSink = { write: (e) => entries.push(e), dispose: () => {} };
    return Object.assign(new Log([sink], "Test", () => new Date(0)), { entries });
}

export function fakeReporter(): TelemetryReporter & {
    events: {
        name: string;
        properties?: Record<string, string>;
        measurements?: Record<string, number>;
    }[];
} {
    const events: {
        name: string;
        properties?: Record<string, string>;
        measurements?: Record<string, number>;
    }[] = [];
    return {
        events,
        telemetryLevel: "all",
        sendTelemetryEvent: (name, properties, measurements) =>
            events.push({ name, properties, measurements }),
        dispose: async () => {},
    };
}

/**
 * A Telemetry over a reporter that captures sent events, with missing
 * properties and measurements recorded as empty objects.
 */
export function fakeTelemetry(level: TelemetryReporter["telemetryLevel"] = "all") {
    const events: {
        name: string;
        props: Record<string, string>;
        metrics: Record<string, number>;
    }[] = [];
    const reporter: TelemetryReporter = {
        telemetryLevel: level,
        sendTelemetryEvent: (name, props, metrics) => {
            events.push({ name, props: props ?? {}, metrics: metrics ?? {} });
        },
        dispose: async () => {},
    };
    return { telemetry: new Telemetry(reporter), events };
}

/**
 * Settings over `values`. `change` sets one value and tells the listeners, as an
 * edit in the settings does; it's for tests that need a change to be seen.
 */
export function fakeSettings(values: Record<string, unknown> = {}) {
    const listeners = new Set<(e: ConfigurationChangeEvent) => unknown>();
    const settings = new Settings({
        getConfiguration: (section) => ({
            get: (key: string) => values[`${section}.${key}`],
            // Every value a test passes counts as set by the user.
            inspect: (key: string) =>
                `${section}.${key}` in values
                    ? { globalValue: values[`${section}.${key}`] }
                    : undefined,
            update: async (key, value) => {
                values[`${section}.${key}`] = value;
            },
        }),
        onDidChangeConfiguration: (listener) => {
            listeners.add(listener);
            return { dispose: () => listeners.delete(listener) };
        },
    });
    const change = (id: string, value: unknown) => {
        values[id] = value;
        for (const listener of listeners) {
            listener({
                affectsConfiguration: (changed: string) =>
                    id === changed || id.startsWith(`${changed}.`),
            });
        }
    };
    return Object.assign(settings, { change });
}

/** `fakeKernel`'s bundled CLI: `bin/databricks`, with `.exe` on Windows as `bundledCliPath` names it. */
export const FAKE_CLI_PATH = `/extension/bin/${process.platform === "win32" ? "databricks.exe" : "databricks"}`;

/**
 * The real kernel over fakes: a scripted CLI, a scripted HTTP transport, and
 * a config file path that tests may create. Nothing starts until
 * `kernel.start()`.
 */
export function fakeKernel(
    overrides: Partial<KernelPlatform> & {
        runner?: FakeProcessRunner;
        httpClient?: FakeHttpClient;
    } = {},
): Kernel & {
    start(): void;
    dispose(): void;
    runner: FakeProcessRunner;
    http: FakeHttpClient;
    /** What `fakeFeatureHost` registers the features for. */
    host: Host;
} {
    const runner = overrides.runner ?? new FakeProcessRunner();
    const http = overrides.httpClient ?? new FakeHttpClient();
    const kernel = createKernel({
        extension: {
            id: "databricks.databricks",
            version: "2.20.0",
            logPath: "/tmp/databricks-vscode-test-logs",
            asAbsolutePath: (p) => `/extension/${p.replace(/^\.\//, "")}`,
            cliVersion: "1.19.0",
            isDevelopment: false,
            globalStoragePath: "/tmp/databricks-vscode-test-storage",
        },
        state: new StateStore({ global: fakeMemento(), workspace: fakeMemento() }),
        settings: fakeSettings(),
        contextKeys: new ContextKeys(async () => {}),
        log: fakeLog(),
        env: { DATABRICKS_CONFIG_FILE: "/nonexistent/.databrickscfg" },
        watch: () => ({ dispose: () => {} }),
        search: globFileSearch,
        // The stand-in's `host.extensions`: `installExtensionPack` and `FakeMsPython` install into it.
        extensions: vscodeExtensions,
        ...overrides,
        runner,
        httpClient: http,
    });
    return Object.assign(kernel, { runner, http, host: overrides.host ?? { kind: "local" } });
}

/** A `CommandRegistry` wired to the fake `vscode` module. */
function fakeCommandRegistry(log: Log = fakeLog(), executions: CommandExecution[] = []) {
    return new CommandRegistry(
        {
            registerCommand: (id, callback) => commands.registerCommand(id, callback),
            showErrorMessage: (message, ...actions) => window.showErrorMessage(message, ...actions),
            executeCommand: (id, ...args) => commands.executeCommand(id, ...args),
        },
        (e) => executions.push(e),
        log,
    );
}

/** `ctx.commands.showError` for a class built without a feature host: renders through the fake `vscode` module. */
export function fakeShowError(log: Log = fakeLog()): (error: UserFacingError) => Promise<void> {
    const registry = fakeCommandRegistry(log);
    return (error) => registry.showError(error);
}

/** Everything `registerFeatures` needs, wired to the fake `vscode` module, for the kernel's host. */
export function fakeFeatureHost(kernel: Kernel & { readonly host?: Host } = fakeKernel()) {
    const log = fakeLog();
    const reporter = fakeReporter();
    const telemetry = new Telemetry(reporter);
    const executions: CommandExecution[] = [];
    const registry = fakeCommandRegistry(log, executions);
    // The bootstrap's scopes, without their remedies.
    registry.defineScope("connection", {
        current: () => kernel.connection.connection,
        unavailable: () => new UserFacingError("NOT_CONNECTED", "Sign in to Databricks first."),
    });
    registry.defineScope("project", {
        current: () => kernel.project.active.value,
        unavailable: () => new UserFacingError("NO_PROJECT", "Open a Databricks project first."),
    });
    const host: FeatureHost = {
        kernel,
        registry,
        sections: new ConfigurationSections(),
        telemetry,
        log,
        ...(kernel.host !== undefined ? { host: kernel.host } : {}),
    };
    return { host, log, reporter, executions };
}
