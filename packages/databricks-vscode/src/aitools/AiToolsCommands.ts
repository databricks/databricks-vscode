import {Disposable, QuickPickItem, window} from "vscode";
import {
    AiToolsAgentStatus,
    AiToolsManager,
    CURSOR_AGENT_ID,
} from "./AiToolsManager";
import {AiToolsScope} from "../cli/CliWrapper";
import {AiToolsInstallSource} from "../telemetry/constants";
import {HostUtils} from "../utils";

interface ScopeQuickPickItem extends QuickPickItem {
    scope: AiToolsScope;
}

interface AgentQuickPickItem extends QuickPickItem {
    agentId: string;
}

export class AiToolsCommands implements Disposable {
    private disposables: Disposable[] = [];

    constructor(private readonly aiToolsManager: AiToolsManager) {}

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }

    installCommand() {
        // The command may be invoked with a source argument (e.g. the first-load
        // init modal passes "initModal"); default to "sidePane" for the manual
        // affordance.
        return async (source: AiToolsInstallSource = "sidePane") => {
            const scope = await this.pickScope();
            if (scope === undefined) {
                return;
            }
            const agents = await this.pickAgents(scope);
            // Dismissing the agent picker cancels the whole install flow.
            if (agents === undefined) {
                return;
            }
            await this.aiToolsManager.install(scope, source, agents);
        };
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
        const quickPick = window.createQuickPick<ScopeQuickPickItem>();
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
        const quickPick = window.createQuickPick<AgentQuickPickItem>();
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
     * Re-run install detection (and update check if installed). Used by the
     * error row to recover after a transient detection failure.
     */
    reloadCommand() {
        return async () => {
            await this.aiToolsManager.initialize();
        };
    }

    updateCommand() {
        return async () => {
            await this.aiToolsManager.update();
        };
    }

    uninstallCommand() {
        return async () => {
            const location = this.aiToolsManager.state.installLocation;
            if (location === undefined) {
                return;
            }
            const confirm = await window.showWarningMessage(
                `Uninstall Databricks AI tools (${location})?`,
                {modal: true},
                "Uninstall"
            );
            if (confirm !== "Uninstall") {
                return;
            }
            await this.aiToolsManager.uninstall();
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
            await this.aiToolsManager.installAgent(
                node.id.slice(prefix.length)
            );
        };
    }
}
