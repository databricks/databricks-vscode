import { ProgressLocation, window, type Disposable, type QuickPickItem } from "vscode";
import type { AiToolsScope } from "../../kernel/cli";
import { CancelledError, UserFacingError } from "../../platform/errors";
import type { Logger } from "../../platform/log";
import type { CopilotCliStatus } from "./copilotShim";
import { AiToolsError, type AiToolsService } from "./AiToolsService";
import { AGENT_ID_PREFIX } from "./AiToolsSection";
import {
    agentInstallBlockReason,
    COPILOT_AGENT_ID,
    COPILOT_CLI_NOT_INSTALLED,
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
const INSTALL_COPILOT_CLI = "Install GitHub Copilot CLI";

interface ScopeItem extends QuickPickItem {
    readonly scope: AiToolsScope;
}

interface AgentItem extends QuickPickItem {
    readonly agentId: string;
    /** False for an agent whose CLI is missing: picking it is a choice, not the default. */
    readonly preselected: boolean;
}

/**
 * The description an agent shows in the install picker, or undefined when it
 * can't be installed at this scope. In Cursor, the Cursor agent is its plugin, always allowed.
 * An agent whose CLI isn't installed stays listed: choosing it offers to install the CLI.
 */
export function describeAgent(
    agent: AiToolsAgentStatus,
    scope: AiToolsScope,
    isCursorPlugin: boolean,
): string | undefined {
    if (isCursorPlugin) {
        return "Databricks plugin";
    }
    const reason = agentInstallBlockReason(agent, scope);
    if (reason === "cliNotInstalled") {
        return `${agent.displayName} CLI not installed`;
    }
    if (reason !== undefined) {
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
export class AiToolsCommands implements Disposable {
    /** Listeners for the Copilot CLI installer terminals still open. */
    private readonly listeners: Disposable[] = [];

    constructor(
        private readonly service: AiToolsService,
        private readonly isCursor: boolean,
        private readonly showLog: () => void,
        private readonly log: Logger,
        /** `ctx.commands.showError`: `initialize` and the installer run outside a command. */
        private readonly showError: (error: UserFacingError) => Promise<void>,
    ) {}

    dispose(): void {
        for (const listener of this.listeners.splice(0)) {
            listener.dispose();
        }
    }

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
        const copilot = agents.includes(COPILOT_AGENT_ID)
            ? await this.service.copilotCliStatus()
            : "installed";
        if (copilot === "installed") {
            await this.withProgress("Installing Databricks AI tools", () =>
                this.service.install(scope, source, agents),
            );
            return;
        }
        // Copilot can't install without its CLI, so the other agents go ahead; the warning
        // doesn't hold them up.
        this.warnCopilotCliNotInstalled(copilot, false, () =>
            this.withProgress("Installing Databricks AI tools", () =>
                this.service.install(scope, source, [COPILOT_AGENT_ID]),
            ),
        ).catch((e) => this.reportCopilotCliInstallerError(e));
        await this.withProgress("Installing Databricks AI tools", () =>
            this.service.install(
                scope,
                source,
                agents.filter((a) => a !== COPILOT_AGENT_ID),
                undefined,
                { [COPILOT_AGENT_ID]: COPILOT_CLI_NOT_INSTALLED },
            ),
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
        const install = () =>
            this.withProgress("Installing Databricks AI tools agent", () =>
                this.service.installAgent(agentId),
            );
        if (agentId === COPILOT_AGENT_ID) {
            const status = await this.service.copilotCliStatus();
            if (status !== "installed") {
                const scope = this.service.state.value.installLocation;
                if (scope !== undefined) {
                    this.service.recordSkippedInstall(scope, "sidePane", {
                        [COPILOT_AGENT_ID]: COPILOT_CLI_NOT_INSTALLED,
                    });
                }
                await this.warnCopilotCliNotInstalled(status, true, install);
                return;
            }
        }
        await install();
    }

    /**
     * Warns that Copilot can't take the install without GitHub Copilot CLI.
     * With VS Code's shim, offers to install the CLI, then `retry`. `modal` is
     * for when Copilot was all the user asked for.
     */
    private async warnCopilotCliNotInstalled(
        status: Exclude<CopilotCliStatus, "installed">,
        modal: boolean,
        retry: () => Promise<void>,
    ): Promise<void> {
        const message = modal
            ? "Databricks AI tools can't be installed for GitHub Copilot because GitHub Copilot CLI is not installed."
            : "Databricks AI tools were not installed for GitHub Copilot because GitHub Copilot CLI is not installed.";
        const detail = "Install GitHub Copilot CLI, then try again.";
        // Without the shim there's nothing for the button to run.
        const actions = typeof status === "object" ? [INSTALL_COPILOT_CLI] : [];
        // Notifications have no `detail`, so the non-modal one folds it into the message.
        const choice = await window.showWarningMessage(
            modal ? message : `${message} ${detail}`,
            modal ? { modal, detail } : {},
            ...actions,
        );
        if (choice === INSTALL_COPILOT_CLI && typeof status === "object") {
            this.openCopilotCliInstaller(status.shim, retry);
        }
    }

    /**
     * Runs VS Code's shim as a terminal's process: with no Copilot CLI to forward
     * to, it offers to install one. Once the terminal closes, offers `retry` if
     * the CLI is now usable.
     */
    private openCopilotCliInstaller(shim: string, retry: () => Promise<void>): void {
        const record = this.service.startCopilotCliInstall();
        const terminal = window.createTerminal({
            name: INSTALL_COPILOT_CLI,
            shellPath: shim,
            // Any argument works: once installed, the shim runs the CLI with it.
            shellArgs: ["--version"],
            // Keeps the Python extensions from typing venv activation into it.
            hideFromUser: true,
        });
        terminal.show();
        const listener: Disposable = window.onDidCloseTerminal((closed) => {
            if (closed !== terminal) {
                return;
            }
            listener.dispose();
            this.afterCopilotCliInstaller(record, retry).catch((e) =>
                this.reportCopilotCliInstallerError(e),
            );
        });
        this.listeners.push(listener);
    }

    private async afterCopilotCliInstaller(
        record: ReturnType<AiToolsService["startCopilotCliInstall"]>,
        retry: () => Promise<void>,
    ): Promise<void> {
        const installed = (await this.service.copilotCliStatus()) === "installed";
        record({ installed });
        if (!installed) {
            return;
        }
        const install = "Install";
        const choice = await window.showInformationMessage(
            "GitHub Copilot CLI is installed. Install Databricks AI tools for GitHub Copilot?",
            install,
        );
        if (choice === install) {
            await retry();
        }
    }

    /** Errors from the background installer flow have no command to render them. */
    private reportCopilotCliInstallerError(e: unknown): void {
        if (e instanceof CancelledError) {
            return;
        }
        this.log.error("The GitHub Copilot CLI install flow failed", e);
        void this.showError(
            e instanceof UserFacingError
                ? e
                : new UserFacingError(
                      "COPILOT_CLI_INSTALL_FAILED",
                      "Failed to install GitHub Copilot CLI.",
                      { cause: e },
                  ),
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
                : [
                      {
                          label: agent.displayName,
                          description,
                          agentId: agent.id,
                          preselected: agentInstallBlockReason(agent, scope) !== "cliNotInstalled",
                      },
                  ];
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
        // Listed agents start checked, except one whose CLI is missing.
        quickPick.selectedItems = items.filter((i) => i.preselected);
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
