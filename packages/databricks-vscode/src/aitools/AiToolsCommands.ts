import {
    ProgressLocation,
    type CancellationToken,
    type Disposable,
    type QuickPickItem,
    type window,
} from "vscode";
import {AiToolsManager, CURSOR_AGENT_ID} from "./AiToolsManager";
import {AiToolsAgentStatus} from "./AiToolsModel";
import {AiToolsScope, ProcessError} from "../cli/CliWrapper";
import {AiToolsInstallSource} from "../telemetry/constants";
import {HostUtils} from "../utils";

interface ScopeQuickPickItem extends QuickPickItem {
    scope: AiToolsScope;
}

interface AgentQuickPickItem extends QuickPickItem {
    agentId: string;
}

/**
 * The prompting UI surface {@link AiToolsCommands} needs, behind one seam. The
 * real implementation just delegates to `window`
 */
export interface AiToolsPrompter {
    withProgress: (typeof window)["withProgress"];
    showInformationMessage: (typeof window)["showInformationMessage"];
    showWarningMessage: (typeof window)["showWarningMessage"];
    createQuickPick: (typeof window)["createQuickPick"];
}

export class AiToolsCommands implements Disposable {
    private disposables: Disposable[] = [];

    constructor(
        private readonly aiToolsManager: AiToolsManager,
        private readonly prompter: AiToolsPrompter
    ) {}

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }

    /**
     * Run a cancellable operation inside a progress notification, surfacing any
     * {@link ProcessError} as an error toast whose "Show Logs" button opens the
     * "Databricks Logs" channel. Non-`ProcessError` failures propagate. This is
     * the single place the AI tools UI wraps the manager's (logic-only)
     * install/update/uninstall methods with VS Code chrome.
     */
    private async withProgress(
        title: string,
        errorPrefix: string,
        run: (token: CancellationToken) => Promise<void>
    ): Promise<void> {
        try {
            await this.prompter.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title,
                    cancellable: true,
                },
                (_progress, token) => run(token)
            );
        } catch (e) {
            if (e instanceof ProcessError) {
                e.showErrorMessage(errorPrefix, "databricks.logs.show");
                return;
            }
            throw e;
        }
    }

    /**
     * Run the one-time activation flow: ask the manager what's needed, then
     * render it. If not installed (and not opted out), show the install prompt;
     * if an update is available, apply it silently with progress. Invoked on
     * activation and by the error-row retry.
     */
    initializeCommand() {
        return async () => {
            const action = await this.aiToolsManager.initialize();
            if (action === "promptInstall") {
                await this.promptInstall();
            } else if (action === "update") {
                await this.runUpdate();
            }
        };
    }

    /**
     * Show the one-time prompt offering to install Databricks AI tools. On
     * accept, run the install flow (passing the "initModal" source so telemetry
     * can distinguish first-load prompt installs from manual side-pane ones). On
     * "Don't show again", opt the user out; a plain dismissal leaves the offer
     * eligible to reappear on a later activation.
     */
    private async promptInstall(): Promise<void> {
        const install = "Install AI tools";
        const dontShowAgain = "Don't show again";
        const choice = await this.prompter.showInformationMessage(
            "Install Databricks AI tools?",
            {
                modal: true,
                detail: "Get skills and plugins so your coding agents work effectively with Databricks. You can also install them later from the Databricks configuration panel.",
            },
            install,
            dontShowAgain
        );
        if (choice === dontShowAgain) {
            await this.aiToolsManager.optOutOfInstallPrompt();
            return;
        }
        if (choice !== install) {
            return;
        }
        await this.runInstall("initModal");
    }

    installCommand() {
        // The command may be invoked with a source argument (e.g. the first-load
        // init modal passes "initModal"); default to "sidePane" for the manual
        // affordance.
        return async (source: AiToolsInstallSource = "sidePane") => {
            await this.runInstall(source);
        };
    }

    /**
     * Drive the install flow: pick a scope, pick the agents, then run the
     * install with a progress notification. Dismissing either picker cancels.
     */
    private async runInstall(source: AiToolsInstallSource): Promise<void> {
        const scope = await this.pickScope();
        if (scope === undefined) {
            return;
        }
        const agents = await this.pickAgents(scope);
        // Dismissing the agent picker cancels the whole install flow.
        if (agents === undefined) {
            return;
        }
        await this.withProgress(
            "Installing Databricks AI tools",
            "Failed to install Databricks AI tools.",
            (token) => this.aiToolsManager.install(scope, source, agents, token)
        );
    }

    /**
     * Show the scope picker. Project scope is always listed, but when no
     * workspace folder is open it shows a "Requires an open folder" hint and
     * cannot be selected (the QuickPick API has no true per-item disable, so we
     * ignore its selection). Resolves to the chosen scope, or undefined if the
     * picker was dismissed.
     */
    private pickScope(): Promise<AiToolsScope | undefined> {
        const hasFolder = this.aiToolsManager.hasProjectFolder;
        const quickPick = this.prompter.createQuickPick<ScopeQuickPickItem>();
        quickPick.title = "Install Databricks AI tools";
        quickPick.placeholder = "Choose where to install the AI tools";
        quickPick.items = [
            {
                label: "$(globe) Global",
                detail: "Available to you across all projects",
                scope: "global",
            },
            {
                label: "$(folder) Project",
                detail: hasFolder
                    ? "Checked into the repo, shared with everyone on the project"
                    : "Open a folder to install AI tools into a project",
                // Hint that project scope needs an open folder (selection of
                // this item is ignored in onDidAccept when there's no folder).
                description: hasFolder ? undefined : "Requires an open folder",
                scope: "project",
            },
        ];

        return new Promise<AiToolsScope | undefined>((resolve) => {
            let resolved: AiToolsScope | undefined;
            this.disposables.push(
                quickPick.onDidAccept(() => {
                    const picked = quickPick.selectedItems[0];
                    // Ignore selection of the disabled project item; keep the
                    // picker open so the choice reads as non-actionable.
                    if (
                        picked === undefined ||
                        (picked.scope === "project" && !hasFolder)
                    ) {
                        return;
                    }
                    resolved = picked.scope;
                    quickPick.hide();
                }),
                quickPick.onDidHide(() => {
                    resolve(resolved);
                    quickPick.dispose();
                })
            );
            quickPick.show();
        });
    }

    /**
     * Show the agent picker for the chosen scope. Lists every agent the CLI
     * knows about and allows selecting multiple; agents already present on the
     * machine (`detected`) are preselected. Resolves to the selected agent ids,
     * or undefined if the picker was dismissed (which cancels the install).
     *
     * If the CLI reports no agents (e.g. an older CLI, or a list failure), the
     * picker is skipped and we resolve to an empty selection so the install
     * falls back to the CLI's default (act on every detected agent).
     */
    private async pickAgents(
        scope: AiToolsScope
    ): Promise<string[] | undefined> {
        const agents = await this.aiToolsManager.listAgents(scope);
        if (agents.length === 0) {
            return [];
        }

        const inCursor = HostUtils.isCursor();
        const quickPick = this.prompter.createQuickPick<AgentQuickPickItem>();
        quickPick.title = "Install Databricks AI tools";
        quickPick.placeholder = "Choose which coding agents to install for";
        quickPick.canSelectMany = true;
        const items: AgentQuickPickItem[] = agents.map(
            (agent: AiToolsAgentStatus) => {
                // In Cursor, the Cursor entry installs the marketplace plugin
                // (a superset of the skills); always start it checked and label
                // it as the plugin rather than a "Detected" skills install.
                const isCursorPlugin = inCursor && agent.id === CURSOR_AGENT_ID;
                return {
                    label: agent.displayName,
                    description: isCursorPlugin
                        ? "Databricks plugin"
                        : agent.detected
                          ? "Detected"
                          : undefined,
                    agentId: agent.id,
                    picked: isCursorPlugin || agent.detected,
                };
            }
        );
        quickPick.items = items;
        // canSelectMany does not preselect from `picked` alone; set the initial
        // selection explicitly so detected agents start checked.
        quickPick.selectedItems = items.filter((i) => i.picked);

        return new Promise<string[] | undefined>((resolve) => {
            let resolved: string[] | undefined;
            this.disposables.push(
                quickPick.onDidAccept(() => {
                    resolved = quickPick.selectedItems.map((i) => i.agentId);
                    quickPick.hide();
                }),
                quickPick.onDidHide(() => {
                    resolve(resolved);
                    quickPick.dispose();
                })
            );
            quickPick.show();
        });
    }

    checkForUpdatesCommand() {
        return async () => {
            await this.aiToolsManager.resolveInstalled();
        };
    }

    /**
     * Re-run the activation flow. Used by the error row to recover after a
     * transient detection failure.
     */
    reloadCommand() {
        return this.initializeCommand();
    }

    private async runUpdate(): Promise<void> {
        await this.withProgress(
            "Updating Databricks AI tools",
            "Failed to update Databricks AI tools.",
            (token) => this.aiToolsManager.update(token)
        );
    }

    updateCommand() {
        return async () => {
            await this.runUpdate();
        };
    }

    uninstallCommand() {
        return async () => {
            const location = this.aiToolsManager.model.installLocation;
            if (location === undefined) {
                return;
            }
            const confirm = await this.prompter.showWarningMessage(
                `Uninstall Databricks AI tools (${location})?`,
                {modal: true},
                "Uninstall"
            );
            if (confirm !== "Uninstall") {
                return;
            }
            await this.withProgress(
                "Uninstalling Databricks AI tools",
                "Failed to uninstall Databricks AI tools.",
                (token) => this.aiToolsManager.uninstall(token)
            );
        };
    }

    addCursorPluginCommand() {
        return async () => {
            await this.aiToolsManager.addCursorPlugin("pluginButton");
        };
    }

    /**
     * Install a single agent from the Agents list's inline "install" button. The
     * tree item is passed as the command argument; its id is
     * `AITOOLS.agent.<agentId>`, from which we recover the agent id.
     */
    installAgentCommand() {
        const prefix = "AITOOLS.agent.";
        return async (node?: {id?: string}) => {
            if (node?.id === undefined || !node.id.startsWith(prefix)) {
                return;
            }
            const agentId = node.id.slice(prefix.length);
            await this.withProgress(
                "Installing Databricks AI tools agent",
                "Failed to install Databricks AI tools agent.",
                (token) => this.aiToolsManager.installAgent(agentId, token)
            );
        };
    }
}
