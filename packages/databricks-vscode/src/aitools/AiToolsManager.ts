import {readFile} from "fs/promises";
import path from "path";
import {
    commands,
    Disposable,
    EventEmitter,
    ProgressLocation,
    window,
} from "vscode";
import {logging} from "@databricks/sdk-experimental";
import {
    AiToolsListResult,
    AiToolsScope,
    CliWrapper,
    ProcessError,
} from "../cli/CliWrapper";
import {StateStorage} from "../vscode-objs/StateStorage";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {Telemetry} from "../telemetry";
import {AiToolsInstallSource, Events} from "../telemetry/constants";
import {Loggers} from "../logger";
import {FileUtils, HostUtils} from "../utils";

/** Cursor marketplace numeric ID for the Databricks plugin. */
const CURSOR_PLUGIN_ID = "26723531";

/** Relative path of the aitools state file within an install root. */
const STATE_FILE_RELATIVE_PATH = path.join(
    ".databricks",
    "aitools",
    "skills",
    ".state.json"
);

/** Where AI tools are installed, or undefined if not installed. */
export type AiToolsInstallLocation = AiToolsScope | undefined;

/** The status of the update check. */
export type AiToolsUpdateStatus =
    | "unknown"
    | "checking"
    | "updating"
    | "upToDate"
    | "updateAvailable"
    | "error";

export interface AiToolsState {
    installLocation: AiToolsInstallLocation;
    updateStatus: AiToolsUpdateStatus;
    /** The installed AI tools release version, if known. */
    version?: string;
    /**
     * True when the last install detection failed with an unexpected error
     * (e.g. a permission/IO error reading the state file) rather than the state
     * file simply being absent. Distinguishes "genuinely not installed" from
     * "couldn't determine install state".
     */
    detectError?: boolean;
}

/**
 * Owns all non-UI logic for the Databricks AI tools feature: detecting whether
 * tools are installed (and where), running install/update via the CLI, checking
 * for available updates, and caching the resolved install location.
 */
export class AiToolsManager implements Disposable {
    private disposables: Disposable[] = [];
    private readonly onDidChangeEmitter = new EventEmitter<void>();
    public readonly onDidChange = this.onDidChangeEmitter.event;

    private _installLocation: AiToolsInstallLocation;
    private _updateStatus: AiToolsUpdateStatus = "unknown";
    private _version: string | undefined;
    private _detectError = false;

    constructor(
        private readonly cli: CliWrapper,
        private readonly stateStorage: StateStorage,
        private readonly workspaceFolderManager: WorkspaceFolderManager,
        private readonly telemetry: Telemetry
    ) {
        this._installLocation = this.stateStorage.get(
            "databricks.aitools.installLocation"
        );
        this.refreshCursorPluginContext();
        this.refreshInstalledContext();
    }

    get state(): AiToolsState {
        return {
            installLocation: this._installLocation,
            updateStatus: this._updateStatus,
            version: this._version,
            detectError: this._detectError,
        };
    }

    get isInstalled(): boolean {
        return this._installLocation !== undefined;
    }

    /**
     * Whether the "add Databricks plugin to Cursor" affordance should be shown:
     * only in Cursor, and only if we haven't already prompted for it.
     * (Cursor exposes no way to query real plugin state, so this is best-effort.)
     */
    get shouldOfferCursorPlugin(): boolean {
        return (
            HostUtils.isCursor() &&
            !this.stateStorage.get("databricks.aitools.cursorPluginPrompted")
        );
    }

    /**
     * Open Cursor's marketplace install modal for the Databricks plugin, and
     * remember that we prompted (to hide the affordance afterwards). We can't
     * confirm the user actually added it — only that we opened the modal.
     *
     * This is decoupled from the CLI install: it opens Cursor's in-app
     * marketplace install modal, which is independent of the skills install.
     * Any failure here is logged but never propagated, so it can't break the
     * install flow when run in parallel.
     */
    async addCursorPlugin(): Promise<void> {
        try {
            await commands.executeCommand(
                "workbench.action.openMarketplaceEditor",
                {
                    pluginId: CURSOR_PLUGIN_ID,
                    openInstallModal: true,
                    skipTracking: true,
                }
            );
        } catch (e) {
            logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                "Failed to open the Cursor marketplace for the Databricks plugin",
                e
            );
            return;
        }
        await this.stateStorage.set(
            "databricks.aitools.cursorPluginPrompted",
            true
        );
        this.refreshCursorPluginContext();
        this.onDidChangeEmitter.fire();
    }

    private refreshCursorPluginContext() {
        commands.executeCommand(
            "setContext",
            "databricks.context.aitools.showCursorPlugin",
            this.shouldOfferCursorPlugin
        );
    }

    /**
     * Sync the `databricks.context.aitools.installed` when-context key with the
     * current install state, so the command palette can show Install vs.
     * Uninstall appropriately.
     */
    private refreshInstalledContext() {
        commands.executeCommand(
            "setContext",
            "databricks.context.aitools.installed",
            this.isInstalled
        );
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
        this.onDidChangeEmitter.dispose();
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
            await readFile(this.stateFilePath(scope));
            return true;
        } catch (e: any) {
            if (e?.code === "ENOENT") {
                return false;
            }
            throw e;
        }
    }

    /**
     * Determine whether AI tools are installed by checking for
     * `.databricks/aitools/skills/.state.json`, first in the project root and
     * then in the user's home directory. Caches and persists the resolved
     * location and fires {@link onDidChange}.
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
            // Detection succeeded (a definitive present/absent answer).
            this._detectError = false;
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
            this._detectError = true;
            this.refreshInstalledContext();
            this.onDidChangeEmitter.fire();
            return this._installLocation;
        }

        this._installLocation = location;
        await this.stateStorage.set(
            "databricks.aitools.installLocation",
            location
        );
        if (location === undefined) {
            this._updateStatus = "unknown";
            this._version = undefined;
        }
        this.refreshInstalledContext();
        this.onDidChangeEmitter.fire();
        return location;
    }

    /**
     * Entry point run on activation (and by the error-row retry). Detects the
     * install state and then:
     *  - if installed, checks for updates and, when one is available, applies it
     *    automatically (updates are silent — no prompt);
     *  - if not installed, shows a one-time prompt offering to install them.
     *
     * Non-blocking failures are swallowed so activation can't be delayed or
     * broken by this best-effort flow.
     */
    async initialize(): Promise<void> {
        try {
            const location = await this.detectInstall();
            if (location === undefined) {
                await this.maybePromptInstall();
                return;
            }
            const status = await this.checkForUpdates();
            if (status === "updateAvailable") {
                await this.update();
            }
        } catch (e) {
            logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                "Failed to initialize Databricks AI tools",
                e
            );
        }
    }

    /**
     * Show a one-time prompt offering to install Databricks AI tools. If the
     * user accepts, run the install flow (which, in Cursor, also opens the
     * plugin install modal). The prompt is shown at most once per machine.
     */
    async maybePromptInstall(): Promise<void> {
        if (this.stateStorage.get("databricks.aitools.installPrompted")) {
            return;
        }
        await this.stateStorage.set("databricks.aitools.installPrompted", true);

        const install = "Install AI tools";
        const choice = await window.showInformationMessage(
            "Install Databricks AI tools?",
            {
                modal: true,
                detail: "Get skills and plugins so your coding agents work effectively with Databricks. You can also install them later from the Databricks configuration panel.",
            },
            install
        );
        if (choice !== install) {
            return;
        }
        // Run the install command so the user picks a scope; the install flow
        // itself opens the Cursor plugin modal when running in Cursor. Pass the
        // "modal" source so telemetry can distinguish first-load prompt installs
        // from manual side-pane installs.
        await commands.executeCommand("databricks.aitools.install", "modal");
    }

    /**
     * Check whether an update is available by comparing each installed skill's
     * version against its latest version (via `aitools list --output json`).
     * `aitools update --check` only prints text, so `list` is the reliable
     * source of truth.
     */
    async checkForUpdates(): Promise<AiToolsUpdateStatus> {
        const scope = this._installLocation;
        if (scope === undefined) {
            this._updateStatus = "unknown";
            this.onDidChangeEmitter.fire();
            return this._updateStatus;
        }

        this._updateStatus = "checking";
        this.onDidChangeEmitter.fire();

        try {
            const result = await this.cli.aitoolsList(this.cwdForScope(scope));
            this._version = result.release;
            this._updateStatus = this.computeUpdateStatus(result, scope);
        } catch (e) {
            logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                "Failed to check for Databricks AI tools updates",
                e
            );
            this._updateStatus = "error";
        }
        this.onDidChangeEmitter.fire();
        return this._updateStatus;
    }

    private computeUpdateStatus(
        result: AiToolsListResult,
        scope: AiToolsScope
    ): AiToolsUpdateStatus {
        const installed = result.skills.filter(
            (s) => s.installed[scope] !== undefined
        );
        const updateAvailable = installed.some(
            (s) => s.installed[scope] !== s.latest_version
        );
        return updateAvailable ? "updateAvailable" : "upToDate";
    }

    /**
     * Install AI tools for the given scope, showing progress. Re-detects the
     * install state and refreshes the update status afterwards.
     *
     * In Cursor, the plugin install is prompted *in parallel* with the CLI
     * install — the two are independent, and the plugin modal must not block or
     * break the skills install / UI refresh.
     */
    async install(
        scope: AiToolsScope,
        source?: AiToolsInstallSource
    ): Promise<void> {
        // Kick off the Cursor plugin prompt in parallel (fire-and-forget; it
        // swallows its own errors). Not awaited so it can't gate the CLI flow.
        if (this.shouldOfferCursorPlugin) {
            void this.addCursorPlugin();
        }

        const recordEvent = this.telemetry.start(Events.AITOOLS_INSTALL);
        try {
            await window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title: "Installing Databricks AI tools",
                    cancellable: true,
                },
                (_progress, token) =>
                    this.cli.aitoolsInstall(
                        scope,
                        this.cwdForScope(scope),
                        token
                    )
            );
            recordEvent({success: true, scope, source});
        } catch (e) {
            recordEvent({success: false, scope, source});
            if (e instanceof ProcessError) {
                e.showErrorMessage("Failed to install Databricks AI tools.");
            } else {
                throw e;
            }
            return;
        }

        await this.detectInstall();
        await this.checkForUpdates();
    }

    /**
     * Uninstall AI tools for the current install scope, showing progress.
     * Re-detects the install state and clears the Cursor-plugin prompt flag
     * afterwards (so a later reinstall re-offers the plugin).
     */
    async uninstall(): Promise<void> {
        const scope = this._installLocation;
        if (scope === undefined) {
            return;
        }
        const recordEvent = this.telemetry.start(Events.AITOOLS_UNINSTALL);
        try {
            await window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title: "Uninstalling Databricks AI tools",
                    cancellable: true,
                },
                (_progress, token) =>
                    this.cli.aitoolsUninstall(
                        scope,
                        this.cwdForScope(scope),
                        token
                    )
            );
            recordEvent({success: true, scope});
        } catch (e) {
            recordEvent({success: false, scope});
            if (e instanceof ProcessError) {
                e.showErrorMessage("Failed to uninstall Databricks AI tools.");
            } else {
                throw e;
            }
            return;
        }
        await this.detectInstall();

        // Clear the Cursor-plugin flag so that if the user reinstalls the tools
        // later they're offered the plugin again (uninstalling the skills does
        // not remove the Cursor plugin, but re-offering it is harmless and
        // matches the "fresh install" expectation).
        await this.stateStorage.set(
            "databricks.aitools.cursorPluginPrompted",
            false
        );
        this.refreshCursorPluginContext();
    }

    /**
     * Update AI tools for the current install scope, showing progress.
     */
    async update(): Promise<void> {
        const scope = this._installLocation;
        if (scope === undefined) {
            return;
        }
        const recordEvent = this.telemetry.start(Events.AITOOLS_UPDATE);
        this._updateStatus = "updating";
        this.onDidChangeEmitter.fire();
        try {
            await window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title: "Updating Databricks AI tools",
                    cancellable: true,
                },
                (_progress, token) =>
                    this.cli.aitoolsUpdate(
                        scope,
                        this.cwdForScope(scope),
                        token
                    )
            );
            recordEvent({success: true, scope});
        } catch (e) {
            recordEvent({success: false, scope});
            if (e instanceof ProcessError) {
                e.showErrorMessage("Failed to update Databricks AI tools.");
            } else {
                throw e;
            }
        } finally {
            // Always reconcile the cached update status with the actual CLI
            // state, even if the update reported an error (it may have
            // partially succeeded). This refreshes the row out of the
            // "Update available" state once the tools are up to date.
            await this.checkForUpdates();
        }
    }
}
