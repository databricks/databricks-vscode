import path from "node:path";
import type { Disposable } from "vscode";
import {
    aiToolsInstall,
    aiToolsList,
    aiToolsUninstall,
    aiToolsUpdate,
    type AiToolsScope,
    type Cli,
} from "../../kernel/cli";
import type { TelemetryRecorder } from "../../kernel/telemetry";
import { UserFacingError } from "../../platform/errors";
import type { Logger } from "../../platform/log";
import { MutableState, type State } from "../../platform/reactive";
import { stateKey, type StateStore } from "../../platform/state";
import {
    agentStatusesOf,
    CURSOR_AGENT_ID,
    describeInstallFailure,
    summarizeInstallErrors,
    updateStatusOf,
    type AiToolsAgentStatus,
    type AiToolsState,
} from "./model";
import {
    AITOOLS_CURSOR_PLUGIN_PROMPT,
    AITOOLS_INSTALL,
    AITOOLS_UNINSTALL,
    AITOOLS_UPDATE,
    type AiToolsCursorPluginSource,
    type AiToolsInstallSource,
} from "./telemetry";

/** The last detected install location, so the row renders before detection ends (same key as before). */
export const INSTALL_LOCATION = stateKey<AiToolsScope | undefined>(
    "databricks.aitools.installLocation",
    "global",
    undefined,
);

/** "Don't show again" on the first-run prompt (same key as before). "Show the AI tools install prompt again" clears it. */
export const HIDE_INSTALL_PROMPT = stateKey<boolean>(
    "databricks.aitools.hideInstallPrompt",
    "global",
    false,
);

/** The Cursor marketplace ID of the Databricks plugin. */
export const CURSOR_PLUGIN_ID = "26723531";

/** The CLI's state file, below the install root. */
const STATE_FILE = path.join(".databricks", "aitools", "skills", ".state.json");

/** What activation does once detection ends. */
export type AiToolsInitAction = "promptInstall" | "update" | "none";

/** A CLI failure the user sees. `Show Logs` is added by the commands. */
export class AiToolsError extends UserFacingError {
    constructor(message: string, cause: unknown) {
        super("AITOOLS_FAILED", message, { cause });
    }
}

export interface AiToolsServiceDeps {
    readonly cli: Cli;
    /** `childEnv` for an `aitools` call: no connection, CLI variables. */
    readonly env: () => Record<string, string>;
    readonly state: StateStore;
    /** The folder project-scope installs go into: the project root, else the first workspace folder. */
    readonly projectFolder: () => string | undefined;
    readonly homeDir: string;
    /** Rejects with an `ENOENT` error when the file doesn't exist, like `fs.promises.readFile`. */
    readonly readFile: (path: string) => Promise<unknown>;
    readonly isCursor: boolean;
    /** Opens Cursor's marketplace install dialog for the plugin. */
    readonly openCursorPlugin: () => Thenable<unknown>;
    readonly telemetry: TelemetryRecorder;
    readonly log: Logger;
}

/**
 * The AI tools (AI-01 to AI-03), without UI: detects where they're
 * installed, checks for updates, and installs, updates and uninstalls them
 * through the CLI. Operations that run the CLI and change the state run one
 * at a time, in order (the old mutex).
 */
export class AiToolsService implements Disposable {
    private readonly current: MutableState<AiToolsState>;
    readonly state: State<AiToolsState>;
    private queue: Promise<unknown> = Promise.resolve();

    constructor(private readonly deps: AiToolsServiceDeps) {
        const installLocation = deps.state.get(INSTALL_LOCATION);
        this.current = new MutableState<AiToolsState>({
            ...(installLocation !== undefined ? { installLocation } : {}),
            updateStatus: "unknown",
            detectError: false,
            agents: [],
        });
        this.state = this.current;
    }

    get isInstalled(): boolean {
        return this.current.value.installLocation !== undefined;
    }

    get hasProjectFolder(): boolean {
        return this.deps.projectFolder() !== undefined;
    }

    get shouldPromptInstall(): boolean {
        return !this.deps.state.get(HIDE_INSTALL_PROMPT);
    }

    setInstallPromptHidden(hidden: boolean): Promise<void> {
        return this.deps.state.set(HIDE_INSTALL_PROMPT, hidden ? true : undefined);
    }

    /** Detects the install, then, when installed, checks for updates. */
    refresh(): Promise<void> {
        return this.serial(async () => {
            await this.detect();
            await this.resolveInstalled();
        });
    }

    /** Re-reads `aitools list` for the install location. */
    checkForUpdates(): Promise<void> {
        return this.serial(() => this.resolveInstalled());
    }

    /**
     * The activation flow's first half: detects, then says what's needed.
     * Never throws; a failure is logged and means nothing to do.
     */
    async initialize(): Promise<AiToolsInitAction> {
        try {
            await this.refresh();
            const { installLocation, updateStatus, detectError } = this.current.value;
            if (detectError) {
                return "none";
            }
            if (installLocation === undefined) {
                return this.shouldPromptInstall ? "promptInstall" : "none";
            }
            return updateStatus === "updateAvailable" ? "update" : "none";
        } catch (e) {
            this.deps.log.error("Failed to initialize Databricks AI tools", e);
            return "none";
        }
    }

    /** The agents the CLI knows for `scope`, for the install picker. Empty on failure. */
    async listAgents(scope: AiToolsScope): Promise<AiToolsAgentStatus[]> {
        try {
            const result = await aiToolsList(this.deps.cli, {
                env: this.deps.env(),
                cwd: this.cwdFor(scope),
            });
            return agentStatusesOf(result.agents, scope);
        } catch (e) {
            this.deps.log.error("Failed to list Databricks AI tools agents", e);
            return [];
        }
    }

    /**
     * Installs for the chosen agents. In Cursor, choosing the Cursor agent
     * means its marketplace plugin instead, opened alongside; `cursor` is
     * never passed to the CLI. The state is reconciled afterwards, also
     * after a failure, which often installed some tools.
     */
    install(
        scope: AiToolsScope,
        source: AiToolsInstallSource,
        agents: readonly string[],
        signal?: AbortSignal,
    ): Promise<void> {
        return this.serial(async () => {
            if (agents.length === 0) {
                return;
            }
            let cliAgents = agents;
            let cursorPlugin: boolean | undefined;
            if (this.deps.isCursor) {
                cursorPlugin = agents.includes(CURSOR_AGENT_ID);
                if (cursorPlugin) {
                    void this.addCursorPlugin(source);
                }
                cliAgents = agents.filter((a) => a !== CURSOR_AGENT_ID);
                if (cliAgents.length === 0) {
                    // Only the plugin: an empty `--agents` would act on every detected agent.
                    this.deps.telemetry.record(AITOOLS_INSTALL, {
                        duration: 0,
                        result: "possible-success",
                        scope,
                        source,
                        agents: [],
                        cursorPlugin,
                    });
                    return;
                }
            }
            try {
                await this.runInstall(scope, cliAgents, source, cursorPlugin, signal);
            } finally {
                await this.detect();
                await this.resolveInstalled();
            }
        });
    }

    /** Installs one more agent into the current location: the Agents rows' install button. */
    installAgent(agentId: string, signal?: AbortSignal): Promise<void> {
        return this.serial(async () => {
            const scope = this.current.value.installLocation;
            if (scope === undefined) {
                return;
            }
            try {
                await this.runInstall(scope, [agentId], "sidePane", undefined, signal);
            } finally {
                await this.resolveInstalled();
            }
        });
    }

    update(signal?: AbortSignal): Promise<void> {
        return this.serial(async () => {
            const scope = this.current.value.installLocation;
            if (scope === undefined) {
                return;
            }
            const record = this.deps.telemetry.start(AITOOLS_UPDATE);
            this.patch({ updateStatus: "updating" });
            try {
                await aiToolsUpdate(this.deps.cli, scope, {
                    env: this.deps.env(),
                    cwd: this.cwdFor(scope),
                    signal,
                });
                record({ success: true, scope });
            } catch (e) {
                record({ success: false, scope });
                throw this.failure("Failed to update Databricks AI tools.", e);
            } finally {
                await this.resolveInstalled();
            }
        });
    }

    uninstall(signal?: AbortSignal): Promise<void> {
        return this.serial(async () => {
            const scope = this.current.value.installLocation;
            if (scope === undefined) {
                return;
            }
            const record = this.deps.telemetry.start(AITOOLS_UNINSTALL);
            try {
                await aiToolsUninstall(this.deps.cli, scope, {
                    env: this.deps.env(),
                    cwd: this.cwdFor(scope),
                    signal,
                });
                record({ success: true, scope });
            } catch (e) {
                record({ success: false, scope });
                throw this.failure("Failed to uninstall Databricks AI tools.", e);
            } finally {
                await this.detect();
            }
        });
    }

    /**
     * Opens Cursor's install dialog for the Databricks plugin. Whether the
     * user added it isn't observable. Failures are logged, never thrown, so
     * it can't break an install running beside it.
     */
    async addCursorPlugin(source: AiToolsCursorPluginSource): Promise<void> {
        try {
            await this.deps.openCursorPlugin();
            this.deps.telemetry.record(AITOOLS_CURSOR_PLUGIN_PROMPT, { success: true, source });
        } catch (e) {
            this.deps.telemetry.record(AITOOLS_CURSOR_PLUGIN_PROMPT, { success: false, source });
            this.deps.log.error(
                "Failed to open the Cursor marketplace for the Databricks plugin",
                e,
            );
        }
    }

    dispose(): void {
        this.current.dispose();
    }

    private async runInstall(
        scope: AiToolsScope,
        agents: readonly string[],
        source: AiToolsInstallSource,
        cursorPlugin: boolean | undefined,
        signal: AbortSignal | undefined,
    ): Promise<void> {
        const record = this.deps.telemetry.start(AITOOLS_INSTALL);
        let result: Awaited<ReturnType<typeof aiToolsInstall>>;
        try {
            result = await aiToolsInstall(this.deps.cli, scope, agents, {
                env: this.deps.env(),
                cwd: this.cwdFor(scope),
                signal,
            });
        } catch (e) {
            record({
                result: "error",
                scope,
                agents: [...agents],
                source,
                ...(cursorPlugin !== undefined ? { cursorPlugin } : {}),
            });
            throw e;
        }
        const { output, error } = result;
        record({
            result: error === undefined ? "success" : "error",
            scope,
            agents: [...agents],
            source,
            ...(cursorPlugin !== undefined ? { cursorPlugin } : {}),
            ...summarizeInstallErrors(output),
        });
        if (error !== undefined) {
            // Under `--output json` stderr is empty and the reason is in the JSON.
            const detail = describeInstallFailure(output) ?? error.message;
            this.deps.log.error("Failed to install Databricks AI tools", detail);
            throw new AiToolsError(`Failed to install Databricks AI tools. ${detail}`, error);
        }
    }

    /**
     * Looks for the CLI's state file in the project folder, then in the home
     * folder. An unexpected read error keeps the last known location and
     * flags the error, so a transient failure can't flip the row to "Install".
     */
    private async detect(): Promise<void> {
        let location: AiToolsScope | undefined;
        try {
            if (this.hasProjectFolder && (await this.stateFileExists("project"))) {
                location = "project";
            } else if (await this.stateFileExists("global")) {
                location = "global";
            }
        } catch (e) {
            this.deps.log.error("Failed to detect Databricks AI tools install state", e);
            this.patch({ detectError: true });
            return;
        }
        await this.deps.state.set(INSTALL_LOCATION, location);
        const { updateStatus, version, agents } = this.current.value;
        this.current.set(
            location === undefined
                ? { updateStatus: "unknown", detectError: false, agents: [] }
                : {
                      installLocation: location,
                      updateStatus,
                      ...(version !== undefined ? { version } : {}),
                      agents,
                      detectError: false,
                  },
        );
    }

    /** Reads `aitools list`: the release, whether an update is available, and the agents. */
    private async resolveInstalled(): Promise<void> {
        const scope = this.current.value.installLocation;
        if (scope === undefined) {
            this.patch({ updateStatus: "unknown" });
            return;
        }
        this.patch({ updateStatus: "checking" });
        try {
            const result = await aiToolsList(this.deps.cli, {
                env: this.deps.env(),
                cwd: this.cwdFor(scope),
            });
            this.patch({
                version: result.release,
                updateStatus: updateStatusOf(result.skills, scope),
                agents: agentStatusesOf(result.agents, scope),
            });
        } catch (e) {
            this.deps.log.error("Failed to check for Databricks AI tools updates", e);
            this.patch({ updateStatus: "error" });
        }
    }

    private async stateFileExists(scope: AiToolsScope): Promise<boolean> {
        try {
            await this.deps.readFile(path.join(this.cwdFor(scope), STATE_FILE));
            return true;
        } catch (e) {
            if (e instanceof Error && (e as NodeJS.ErrnoException).code === "ENOENT") {
                return false;
            }
            throw e;
        }
    }

    /** The project folder for `project`, the home folder for `global`. */
    private cwdFor(scope: AiToolsScope): string {
        if (scope === "global") {
            return this.deps.homeDir;
        }
        const folder = this.deps.projectFolder();
        if (folder === undefined) {
            throw new UserFacingError(
                "NO_FOLDER",
                "Open a folder to install AI tools into a project.",
            );
        }
        return folder;
    }

    private patch(patch: Partial<AiToolsState>) {
        this.current.set({ ...this.current.value, ...patch });
    }

    private failure(message: string, cause: unknown): Error {
        if (cause instanceof Error && cause.name === "CancelledError") {
            return cause;
        }
        this.deps.log.error(message, cause);
        const detail = cause instanceof Error ? cause.message : String(cause);
        return new AiToolsError(`${message} ${detail}`, cause);
    }

    private serial<T>(operation: () => Promise<T>): Promise<T> {
        const run = this.queue.then(operation, operation);
        this.queue = run.catch(() => {});
        return run;
    }
}
