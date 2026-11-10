import { ProgressLocation, window, type QuickPickItem } from "vscode";
import type { AiToolsScope } from "../../kernel/cli";
import { CancelledError, UserFacingError } from "../../platform/errors";
import type { Logger } from "../../platform/log";
import { AiToolsError, type AiToolsService } from "./AiToolsService";
import { AGENT_ID_PREFIX } from "./AiToolsSection";
import {
    agentInstallBlockReason,
    CURSOR_AGENT_ID,
    supportsScope,
    type AiToolsAgentStatus,
} from "./model";
import type { AiToolsInstallSource } from "./telemetry";

export const INSTALL_PROMPT = "Install Databricks AI tools?";
const INSTALL_PROMPT_DETAIL =
    "Get skills and plugins so your coding agents work effectively with Databricks. You can also install them later from the Models & AI tools view.";
const INSTALL_CHOICE = "Install AI tools";
const DONT_SHOW_AGAIN = "Don't show again";

interface ScopeItem extends QuickPickItem {
    readonly scope: AiToolsScope;
}

interface AgentItem extends QuickPickItem {
    readonly agentId: string;
}

/**
 * The description an agent shows in the install picker, or undefined when it
 * can't be installed at this scope. In Cursor, the Cursor agent is its plugin, always allowed.
 */
export function describeAgent(
    agent: AiToolsAgentStatus,
    scope: AiToolsScope,
    isCursorPlugin: boolean,
): string | undefined {
    if (isCursorPlugin) {
        return "Databricks plugin";
    }
    if (agentInstallBlockReason(agent, scope) !== undefined) {
        return undefined;
    }
    return "Detected";
}

/**
 * The AI tools flows with UI (AI-01, AI-02), ported from the old
 * `AiToolsCommands`: the first-run prompt, the install pickers, and the
 * progress notifications. CLI failures are thrown as `UserFacingError`s
 * with "Show Logs"; the command registry renders them.
 */
export class AiToolsCommands {
    constructor(
        private readonly service: AiToolsService,
        private readonly isCursor: boolean,
        private readonly showLog: () => void,
        private readonly log: Logger,
        /** `ctx.commands.showError`: `initialize` runs outside a command. */
        private readonly showError: (error: UserFacingError) => Promise<void>,
    ) {}

    /**
     * The activation flow: offer to install when nothing is installed and
     * the prompt isn't hidden, and apply an available update. Runs outside
     * a command, so it shows its errors through `showError`.
     */
    async initialize(): Promise<void> {
        try {
            const action = await this.service.initialize();
            if (action === "promptInstall") {
                await this.promptInstall();
            } else if (action === "update") {
                await this.update();
            }
        } catch (e) {
            if (e instanceof CancelledError) {
                return;
            }
            this.log.error("Failed to initialize Databricks AI tools", e);
            await this.showError(
                e instanceof UserFacingError
                    ? e
                    : new UserFacingError(
                          "AI_TOOLS_INIT_FAILED",
                          "Failed to initialize Databricks AI tools.",
                          { cause: e },
                      ),
            );
        }
    }

    /**
     * The first-run prompt, as a notification instead of the old modal.
     * "Don't show again" hides it until "Show AI tools install prompt
     * again" undoes that; a dismissal leaves it for the next activation.
     */
    async promptInstall(): Promise<void> {
        const choice = await window.showInformationMessage(
            `${INSTALL_PROMPT} ${INSTALL_PROMPT_DETAIL}`,
            INSTALL_CHOICE,
            DONT_SHOW_AGAIN,
        );
        if (choice === DONT_SHOW_AGAIN) {
            await this.service.setInstallPromptHidden(true);
            return;
        }
        if (choice === INSTALL_CHOICE) {
            await this.install("initModal");
        }
    }

    /** Undoes "Don't show again", and shows the prompt now. */
    async showPromptAgain(): Promise<void> {
        await this.service.setInstallPromptHidden(false);
        await this.promptInstall();
    }

    /** Scope, then agents, then the install. Dismissing either picker cancels. */
    async install(source: AiToolsInstallSource = "sidePane"): Promise<void> {
        const scope = await this.pickScope();
        if (scope === undefined) {
            return;
        }
        const agents = await this.pickAgents(scope);
        if (agents.length === 0) {
            return;
        }
        await this.withProgress("Installing Databricks AI tools", () =>
            this.service.install(scope, source, agents),
        );
    }

    async update(): Promise<void> {
        await this.withProgress("Updating Databricks AI tools", () => this.service.update());
    }

    async uninstall(): Promise<void> {
        const location = this.service.state.value.installLocation;
        if (location === undefined) {
            return;
        }
        // A modal, as before: uninstalling removes files the user may have committed.
        const confirm = await window.showWarningMessage(
            `Uninstall Databricks AI tools (${location})?`,
            { modal: true },
            "Uninstall",
        );
        if (confirm !== "Uninstall") {
            return;
        }
        await this.withProgress("Uninstalling Databricks AI tools", () => this.service.uninstall());
    }

    /** The Agents rows' install button; the row's id names the agent. */
    async installAgent(node?: { id?: string }): Promise<void> {
        if (node?.id === undefined || !node.id.startsWith(AGENT_ID_PREFIX)) {
            return;
        }
        const agentId = node.id.slice(AGENT_ID_PREFIX.length);
        await this.withProgress("Installing Databricks AI tools agent", () =>
            this.service.installAgent(agentId),
        );
    }

    private async withProgress(title: string, run: () => Promise<void>): Promise<void> {
        try {
            await window.withProgress({ location: ProgressLocation.Notification, title }, run);
        } catch (e) {
            if (e instanceof AiToolsError) {
                throw new UserFacingError(e.code, e.userMessage, {
                    cause: e.cause,
                    actions: [{ title: "Show Logs", run: this.showLog }],
                });
            }
            throw e;
        }
    }

    /** Project scope shows without a folder too, but can't be picked then. */
    private pickScope(): Promise<AiToolsScope | undefined> {
        const hasFolder = this.service.hasProjectFolder;
        const quickPick = window.createQuickPick<ScopeItem>();
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
                ...(hasFolder ? {} : { description: "Requires an open folder" }),
                scope: "project",
            },
        ];
        return new Promise((resolve) => {
            let picked: AiToolsScope | undefined;
            quickPick.onDidChangeSelection((selected) => {
                const item = selected[0];
                if (item === undefined || (item.scope === "project" && !hasFolder)) {
                    return;
                }
                picked = item.scope;
                quickPick.hide();
            });
            quickPick.onDidHide(() => {
                quickPick.dispose();
                resolve(picked);
            });
            quickPick.show();
        });
    }

    /**
     * The agents that can be installed at this scope, detected ones checked.
     * No agents at all means the list failed; the install can't go on then.
     */
    private async pickAgents(scope: AiToolsScope): Promise<string[]> {
        const agents = await this.service.listAgents(scope);
        if (agents.length === 0) {
            throw new UserFacingError(
                "AI_TOOLS_NO_AGENTS",
                "Failed to load Databricks AI tools installer.",
            );
        }
        // VS Code has no disabled items, so an agent that can't be installed isn't listed.
        const items = agents.flatMap((agent): AgentItem[] => {
            const description = describeAgent(
                agent,
                scope,
                this.isCursor && agent.id === CURSOR_AGENT_ID,
            );
            return description === undefined
                ? []
                : [{ label: agent.displayName, description, agentId: agent.id }];
        });
        if (items.length === 0) {
            // Not awaited: the message can stay open after the install has nothing to do.
            void window.showInformationMessage(noAgentsMessage(agents, scope));
            return [];
        }
        const quickPick = window.createQuickPick<AgentItem>();
        quickPick.title = "Install Databricks AI tools";
        quickPick.placeholder = "Choose agents to install for";
        quickPick.canSelectMany = true;
        quickPick.items = items;
        // Every listed agent is installable, so all of them start checked.
        quickPick.selectedItems = items;
        return new Promise((resolve) => {
            let picked: string[] = [];
            quickPick.onDidAccept(() => {
                picked = quickPick.selectedItems.map((i) => i.agentId);
                quickPick.hide();
            });
            quickPick.onDidHide(() => {
                quickPick.dispose();
                resolve(picked);
            });
            quickPick.show();
        });
    }
}

/**
 * What to say when no agent can take the install. Names the agents that
 * could be installed once they're set up, and the CLI route for an agent
 * that isn't detected.
 */
function noAgentsMessage(agents: readonly AiToolsAgentStatus[], scope: AiToolsScope): string {
    // Agents that could install at this scope once detected.
    const candidates = agents.filter((a) => !a.detected && supportsScope(a, scope));
    if (candidates.length === 0) {
        return "No coding agents support Databricks AI tools at project scope. Install the AI tools for global scope instead.";
    }
    const names = candidates.map((a) => a.displayName).join(", ");
    return `None of the coding agents that support this scope are detected on this machine. Install one of ${names}, then try again. You can also run "databricks aitools install --agents ${candidates[0]!.id} --scope ${scope}" in a terminal.`;
}
