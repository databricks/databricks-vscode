import path from "path";
import {CancellationToken, commands, Disposable} from "vscode";
import {logging} from "@databricks/sdk-experimental";
import {
    AiToolsAgent,
    AiToolsScope,
    AiToolsSkill,
    CliWrapper,
} from "../cli/CliWrapper";
import {StateStorage} from "../vscode-objs/StateStorage";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {CustomWhenContext} from "../vscode-objs/CustomWhenContext";
import {Telemetry} from "../telemetry";
import {
    AiToolsCursorPluginSource,
    AiToolsInstallSource,
    Events,
} from "../telemetry/constants";
import {Loggers} from "../logger";
import {FileUtils, HostUtils} from "../utils";
import {
    AiToolsAgentStatus,
    AiToolsInstallLocation,
    AiToolsModel,
    AiToolsUpdateStatus,
} from "./AiToolsModel";

/**
 * Reads the aitools state file at `path`, resolving with its contents and
 * rejecting with an `ENOENT`-coded error when it is absent (i.e. the same
 * contract as `fs/promises` `readFile`)
 */
export type StateFileLoader = (path: string) => Promise<unknown>;

/** Cursor marketplace numeric ID for the Databricks plugin. */
const CURSOR_PLUGIN_ID = "26723531";

/**
 * The Cursor agent id as reported by `aitools list`. In Cursor we install the
 * marketplace plugin (a superset of the skills) instead of passing this to the
 * CLI, so it's filtered out of any `--agents` selection.
 */
export const CURSOR_AGENT_ID = "cursor";

/** Relative path of the aitools state file within an install root. */
const STATE_FILE_RELATIVE_PATH = path.join(
    ".databricks",
    "aitools",
    "skills",
    ".state.json"
);

/**
 * What activation should do after {@link AiToolsManager.initialize} has detected
 * the install state and (if installed) resolved the update status. The manager
 * decides *what* is needed but leaves the UI (progress, prompt) to
 * {@link AiToolsCommands}:
 *  - `"promptInstall"` — not installed: offer the one-time install prompt.
 *  - `"update"` — installed and an update is available: apply it (silently).
 *  - `"none"` — installed and up to date (or opted out / detection errored):
 *    nothing to do.
 */
export type AiToolsInitAction = "promptInstall" | "update" | "none";

function computeUpdateStatus(
    skills: AiToolsSkill[],
    scope: AiToolsScope
): AiToolsUpdateStatus {
    const updateAvailable = skills.some(
        (s) => s.installed[scope] && s.installed[scope] !== s.latest_version
    );
    return updateAvailable ? "updateAvailable" : "upToDate";
}

function computeAgentsStatuses(
    agents: AiToolsAgent[],
    scope: AiToolsScope
): AiToolsAgentStatus[] {
    return agents.map((agent) => ({
        displayName: agent.display_name,
        id: agent.name,
        type: agent.managed ? "plugin" : "skills-only",
        detected: agent.detected,
        version: agent.installed[scope]?.version,
        skillsOnly:
            agent.managed && agent.installed[scope]?.delivery === "skills",
    }));
}

/**
 * Owns all non-UI logic for the Databricks AI tools feature: detecting whether
 * tools are installed (and where), running install/update via the CLI, checking
 * for available updates, and caching the resolved install location.
 */
export class AiToolsManager implements Disposable {
    public readonly model: AiToolsModel;

    constructor(
        private readonly cli: CliWrapper,
        private readonly stateStorage: StateStorage,
        private readonly workspaceFolderManager: WorkspaceFolderManager,
        private readonly customWhenContext: CustomWhenContext,
        private readonly telemetry: Telemetry,
        private readonly loadStateFile: StateFileLoader
    ) {
        this.model = new AiToolsModel(
            this.stateStorage.get("databricks.aitools.installLocation")
        );
        this.refreshCursorPluginContext();
        this.refreshInstalledContext();
    }

    get isInstalled(): boolean {
        return this.model.isInstalled;
    }

    /**
     * Open Cursor's marketplace install modal for the Databricks plugin. We
     * can't confirm the user actually added it — only that we opened the modal.
     *
     * This is decoupled from the CLI install: it opens Cursor's in-app
     * marketplace install modal, which is independent of the skills install.
     * Any failure here is logged but never propagated, so it can't break the
     * install flow when run in parallel.
     */
    async addCursorPlugin(source?: AiToolsCursorPluginSource): Promise<void> {
        const recordEvent = this.telemetry.start(
            Events.AITOOLS_CURSOR_PLUGIN_PROMPT
        );
        try {
            await commands.executeCommand(
                "workbench.action.openMarketplaceEditor",
                {
                    pluginId: CURSOR_PLUGIN_ID,
                    openInstallModal: true,
                    skipTracking: true,
                }
            );
            recordEvent({success: true, source});
        } catch (e) {
            recordEvent({success: false, source});
            logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                "Failed to open the Cursor marketplace for the Databricks plugin",
                e
            );
        }
    }

    /**
     * Whether the "add Databricks plugin to Cursor" button should be visible on
     * the top-level AI tools row: always, when running in Cursor, so the user
     * can (re-)open the plugin modal at any time.
     */
    private refreshCursorPluginContext() {
        this.customWhenContext.setAiToolsShowCursorPlugin(HostUtils.isCursor());
    }

    /**
     * Sync the `databricks.context.aitools.installed` when-context key with the
     * current install state, so the command palette can show Install vs.
     * Uninstall appropriately.
     */
    private refreshInstalledContext() {
        this.customWhenContext.setAiToolsInstalled(this.isInstalled);
    }

    dispose() {
        this.model.dispose();
    }

    /**
     * Whether a workspace folder is open. Project-scope operations need one (the
     * skills install into `.databricks/aitools/skills` under the folder); global
     * operations run against the home dir and do not.
     */
    get hasProjectFolder(): boolean {
        // `activeProjectUri` throws when no folder is active; treat that as
        // "no project folder" rather than propagating.
        try {
            return this.workspaceFolderManager.activeProjectUri !== undefined;
        } catch {
            return false;
        }
    }

    private get projectRoot(): string {
        return this.workspaceFolderManager.activeProjectUri.fsPath;
    }

    /**
     * Working directory for a CLI invocation, chosen by scope: the project root
     * for `project`, the home dir for `global`. Only `project` requires an open
     * workspace folder, so global operations work in a folderless window.
     */
    private cwdForScope(scope: AiToolsScope): string {
        return scope === "project" ? this.projectRoot : FileUtils.getHomedir();
    }

    private stateFilePath(scope: AiToolsScope): string {
        return path.join(this.cwdForScope(scope), STATE_FILE_RELATIVE_PATH);
    }

    private async stateFileExists(scope: AiToolsScope): Promise<boolean> {
        try {
            await this.loadStateFile(this.stateFilePath(scope));
            return true;
        } catch (e: unknown) {
            if (e instanceof Error && "code" in e && e.code === "ENOENT") {
                return false;
            }
            throw e;
        }
    }

    /**
     * Determine whether AI tools are installed by checking for
     * `.databricks/aitools/skills/.state.json`, first in the project root and
     * then in the user's home directory. Caches and persists the resolved
     * location and fires {@link AiToolsModel.onDidChange}.
     */
    async detectInstall(): Promise<AiToolsInstallLocation> {
        let location: AiToolsInstallLocation;
        try {
            // Project scope only exists when a folder is open; otherwise skip
            // straight to checking the global (home dir) install.
            if (
                this.hasProjectFolder &&
                (await this.stateFileExists("project"))
            ) {
                location = "project";
            } else if (await this.stateFileExists("global")) {
                location = "global";
            }
        } catch (e) {
            // Unexpected error (e.g. EACCES/EIO reading the state file) rather
            // than the file being absent. Don't overwrite the last-known-good
            // install location with `undefined` — a transient failure must not
            // flip an installed toolset to "not installed". Flag the error so
            // the UI can surface a reload affordance instead of the install
            // prompt.
            logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                "Failed to detect Databricks AI tools install state",
                e
            );
            this.model.update({detectError: true});
            this.refreshInstalledContext();
            return this.model.installLocation;
        }

        await this.stateStorage.set(
            "databricks.aitools.installLocation",
            location
        );
        // Detection succeeded (a definitive present/absent answer), so clear the
        // error flag. When nothing is installed, also reset the derived status
        // and version.
        this.model.update({
            installLocation: location,
            detectError: false,
            ...(location === undefined
                ? {updateStatus: "unknown", version: undefined}
                : {}),
        });
        this.refreshInstalledContext();
        return location;
    }

    /**
     * Entry point run on activation (and by the error-row retry). Detects the
     * install state and then:
     *  - if installed, checks for updates and reports whether one is available so
     *    the caller can apply it (updates are silent — no prompt);
     *  - if not installed (and the user hasn't opted out), reports that the
     *    one-time install prompt should be shown.
     *
     * Returns the {@link AiToolsInitAction} the caller should take. All UI
     * (progress, prompt) is left to {@link AiToolsCommands}. Non-blocking
     * failures are swallowed (resolving to `"none"`) so activation can't be
     * delayed or broken by this best-effort flow.
     */
    async initialize(): Promise<AiToolsInitAction> {
        try {
            const location = await this.detectInstall();
            if (location === undefined) {
                return this.shouldPromptInstall ? "promptInstall" : "none";
            }
            await this.resolveInstalled();
            return this.model.state.updateStatus === "updateAvailable"
                ? "update"
                : "none";
        } catch (e) {
            logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                "Failed to initialize Databricks AI tools",
                e
            );
            return "none";
        }
    }

    /**
     * Whether the one-time "install AI tools" prompt should be offered: true
     * unless the user opted out via "Don't show again" (see
     * {@link optOutOfInstallPrompt}). A plain dismissal doesn't opt out, so the
     * offer can resurface on a later activation.
     */
    get shouldPromptInstall(): boolean {
        return !this.stateStorage.get("databricks.aitools.hideInstallPrompt");
    }

    /**
     * Record that the user opted out of the install prompt ("Don't show again"),
     * so it won't be offered again. Called by {@link AiToolsCommands} when the
     * prompt is declined with the opt-out affordance.
     */
    async optOutOfInstallPrompt(): Promise<void> {
        await this.stateStorage.set(
            "databricks.aitools.hideInstallPrompt",
            true
        );
    }

    /**
     * List the coding agents known to the CLI for the given scope (via
     * `aitools list --output json`), used to populate the install-time agent
     * picker. `detected` marks agents already present on the machine so the UI
     * can preselect them. Returns an empty array on any failure — the install
     * flow then falls back to the CLI's default (act on every detected agent).
     */
    async listAgents(scope: AiToolsScope): Promise<AiToolsAgentStatus[]> {
        try {
            const result = await this.cli.aitoolsList(this.cwdForScope(scope));
            return computeAgentsStatuses(result.agents, scope);
        } catch (e) {
            logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                "Failed to list Databricks AI tools agents",
                e
            );
            return [];
        }
    }

    /**
     * Check whether an update is available by comparing each installed skill's
     * version against its latest version (via `aitools list --output json`).
     * `aitools update --check` only prints text, so `list` is the reliable
     * source of truth.
     */
    async resolveInstalled(): Promise<void> {
        const scope = this.model.installLocation;
        if (scope === undefined) {
            this.model.update({updateStatus: "unknown"});
            return;
        }

        this.model.update({updateStatus: "checking"});

        try {
            const result = await this.cli.aitoolsList(this.cwdForScope(scope));
            this.model.update({
                version: result.release,
                updateStatus: computeUpdateStatus(result.skills, scope),
                agents: computeAgentsStatuses(result.agents, scope),
            });
        } catch (e) {
            logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                "Failed to check for Databricks AI tools updates",
                e
            );
            this.model.update({updateStatus: "error"});
        }
    }

    /**
     * Install AI tools for the given scope. Re-detects the install state and
     * refreshes the update status afterwards, and rethrows any {@link
     * ProcessError} for {@link AiToolsCommands} to surface — the reconciliation
     * still runs first (via `finally`), since a failed install often still
     * landed some tools.
     *
     * `token` is threaded from the caller's progress notification so the CLI run
     * is cancellable.
     *
     * In Cursor, selecting the Cursor agent means "install the Databricks
     * marketplace plugin" (a superset of the Cursor skills), not "install the
     * cursor skills via the CLI". So when running in Cursor and `cursor` is in
     * the selection, we open the plugin modal in parallel (fire-and-forget) and
     * strip `cursor` from the CLI `--agents` list — we never pass
     * `--agents cursor`.
     */
    async install(
        scope: AiToolsScope,
        source?: AiToolsInstallSource,
        agents?: string[],
        token?: CancellationToken
    ): Promise<void> {
        let cliAgents = agents;
        let cursorPlugin = false;
        if (HostUtils.isCursor() && agents !== undefined) {
            if (agents.includes(CURSOR_AGENT_ID)) {
                // Kick off the Cursor plugin prompt in parallel
                // (fire-and-forget; it swallows its own errors). Not awaited so
                // it can't gate the CLI flow. The plugin prompt inherits the
                // install's source ('initModal' / 'sidePane').
                cursorPlugin = true;
                void this.addCursorPlugin(source);
            }
            cliAgents = agents.filter((a) => a !== CURSOR_AGENT_ID);
            // The user picked *only* the Cursor plugin: there are no skills to
            // install via the CLI. Record the install (the plugin) and bail out
            // before the CLI call — passing an empty `--agents` list would make
            // the CLI act on every detected agent, which is not what was chosen.
            if (agents.length > 0 && cliAgents.length === 0) {
                this.telemetry.recordEvent(Events.AITOOLS_INSTALL, {
                    duration: 0,
                    // The plugin is installed via Cursor's marketplace modal,
                    // which we open but can't confirm the user acted on, so the
                    // outcome is only a possible success.
                    result: "possible-success",
                    scope,
                    source,
                    agents: cliAgents,
                    cursorPlugin,
                });
                return;
            }
        }

        const recordEvent = this.telemetry.start(Events.AITOOLS_INSTALL);
        try {
            await this.cli.aitoolsInstall(
                scope,
                this.cwdForScope(scope),
                token,
                cliAgents
            );
            recordEvent({
                result: "success",
                scope,
                source,
                agents: cliAgents,
                cursorPlugin,
            });
        } catch (e) {
            recordEvent({
                result: "error",
                scope,
                source,
                agents: cliAgents,
                cursorPlugin,
            });
            throw e;
        } finally {
            // Always reconcile: a failed install often still installed some
            // tools (e.g. one agent's CLI was missing), so refresh the panel to
            // reflect whatever actually landed rather than leaving it stale.
            await this.detectInstall();
            await this.resolveInstalled();
        }
    }

    /**
     * Install a single coding agent into the current install scope. Used by the
     * per-agent "install" button in the Agents list to add an agent that wasn't
     * installed alongside the others. Re-resolves the agent statuses afterwards
     * (even on failure) so the row reflects the real CLI state, and rethrows any
     * error for {@link AiToolsCommands} to surface.
     */
    async installAgent(
        agentId: string,
        token?: CancellationToken
    ): Promise<void> {
        const scope = this.model.installLocation;
        if (scope === undefined) {
            return;
        }
        const recordEvent = this.telemetry.start(Events.AITOOLS_INSTALL);
        try {
            await this.cli.aitoolsInstall(
                scope,
                this.cwdForScope(scope),
                token,
                [agentId]
            );
            recordEvent({
                result: "success",
                scope,
                source: "sidePane",
                agents: [agentId],
            });
        } catch (e) {
            recordEvent({
                result: "error",
                scope,
                source: "sidePane",
                agents: [agentId],
            });
            throw e;
        } finally {
            // Reconcile the row even on failure: the install may have partially
            // succeeded.
            await this.resolveInstalled();
        }
    }

    /**
     * Uninstall AI tools for the current install scope. Re-detects the install
     * state afterwards (even on failure, since a failed uninstall may have
     * removed some tools) and rethrows any error for {@link AiToolsCommands} to
     * surface.
     */
    async uninstall(token?: CancellationToken): Promise<void> {
        const scope = this.model.installLocation;
        if (scope === undefined) {
            return;
        }
        const recordEvent = this.telemetry.start(Events.AITOOLS_UNINSTALL);
        try {
            await this.cli.aitoolsUninstall(
                scope,
                this.cwdForScope(scope),
                token
            );
            recordEvent({success: true, scope});
        } catch (e) {
            recordEvent({success: false, scope});
            throw e;
        } finally {
            await this.detectInstall();
        }
    }

    /**
     * Update AI tools for the current install scope. Reconciles the cached
     * update status with the real CLI state afterwards (even on failure) and
     * rethrows any error for {@link AiToolsCommands} to surface.
     */
    async update(token?: CancellationToken): Promise<void> {
        const scope = this.model.installLocation;
        if (scope === undefined) {
            return;
        }
        const recordEvent = this.telemetry.start(Events.AITOOLS_UPDATE);
        this.model.update({updateStatus: "updating"});
        try {
            await this.cli.aitoolsUpdate(scope, this.cwdForScope(scope), token);
            recordEvent({success: true, scope});
        } catch (e) {
            recordEvent({success: false, scope});
            throw e;
        } finally {
            // Always reconcile the cached update status with the actual CLI
            // state, even if the update reported an error (it may have
            // partially succeeded). This refreshes the row out of the
            // "Update available" state once the tools are up to date.
            await this.resolveInstalled();
        }
    }
}
