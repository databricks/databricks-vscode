import { ThemeColor, ThemeIcon, TreeItemCollapsibleState, type Event } from "vscode";
import type { AiToolsScope } from "../../kernel/cli";
import {
    MODELS_SECTION_ORDER,
    type ConfigurationItem,
    type ConfigurationSection,
} from "../../platform/ui/sections";
import {
    agentInstallBlockReason,
    CURSOR_AGENT_ID,
    type AiToolsAgentStatus,
    type AiToolsState,
    type AiToolsUpdateStatus,
} from "./model";

export const INSTALL = "databricks.aitools.install";
export const RELOAD = "databricks.aitools.reload";
export const INSTALL_AGENT = "databricks.aitools.installAgent";

const ROOT_ID = "AITOOLS";
const AGENTS_ID = `${ROOT_ID}.agents`;
/** The Agents rows' ids; the install button recovers the agent from it. */
export const AGENT_ID_PREFIX = `${ROOT_ID}.agent.`;

const contextValue = (key: string) => `databricks.configuration.aitools.${key}`;
const robot = (color: "blue" | "green") =>
    new ThemeIcon("hubot", new ThemeColor(`charts.${color}`));
const blocked = () => new ThemeIcon("circle-slash", new ThemeColor("disabledForeground"));
const warning = () => new ThemeIcon("warning", new ThemeColor("errorForeground"));

/**
 * The AI tools rows (AI-03), ported from the old `AiToolsComponent`: "Install
 * AI tools", or "AI tools" with its state, Scope, Version and the Agents. In
 * Cursor the Cursor agent isn't listed: its plugin has a button on the row.
 * They show in the Models & AI tools view, with or without a project.
 */
export class AiToolsSection implements ConfigurationSection {
    readonly id = "aiTools";
    readonly view = "modelsAndAiTools";
    readonly order = MODELS_SECTION_ORDER.aiTools;

    constructor(
        private readonly state: () => AiToolsState,
        private readonly isCursor: boolean,
        readonly onDidChange: Event<void>,
    ) {}

    getChildren(parent?: ConfigurationItem): ConfigurationItem[] {
        const state = this.state();
        if (parent === undefined) {
            return [this.root(state)];
        }
        const { installLocation, detectError, version, agents } = state;
        if (installLocation === undefined || detectError) {
            return [];
        }
        const visible = agents.filter((a) => !(this.isCursor && a.id === CURSOR_AGENT_ID));
        if (parent.id === ROOT_ID) {
            return [
                {
                    label: "Scope",
                    id: `${ROOT_ID}.scope`,
                    description: installLocation,
                    collapsibleState: TreeItemCollapsibleState.None,
                },
                ...(version !== undefined
                    ? [
                          {
                              label: "Version",
                              id: `${ROOT_ID}.version`,
                              description: version,
                              collapsibleState: TreeItemCollapsibleState.None,
                          },
                      ]
                    : []),
                ...(agents.length > 0
                    ? [
                          {
                              label: "Agents",
                              id: AGENTS_ID,
                              description: `${visible.filter((a) => a.version !== undefined).length} installed`,
                              collapsibleState: TreeItemCollapsibleState.Expanded,
                          },
                      ]
                    : []),
            ];
        }
        if (parent.id === AGENTS_ID) {
            return visible.map((agent) => agentRow(agent, installLocation));
        }
        return [];
    }

    /** What the tools give, while they aren't installed. */
    message(): string | undefined {
        const { installLocation, detectError } = this.state();
        return installLocation === undefined && !detectError
            ? "Get skills and plugins so your coding agents work effectively with Databricks."
            : undefined;
    }

    private root(state: AiToolsState): ConfigurationItem {
        if (state.detectError) {
            // Not the install row: the tools may well be installed.
            return {
                label: "AI tools",
                id: ROOT_ID,
                description: "Failed to check installation · click to retry",
                tooltip: "Failed to check the Databricks AI tools installation. Click to retry.",
                contextValue: contextValue("error"),
                iconPath: warning(),
                collapsibleState: TreeItemCollapsibleState.None,
                command: { title: "Retry AI tools detection", command: RELOAD },
            };
        }
        if (state.installLocation === undefined) {
            return {
                label: "Install AI tools",
                id: ROOT_ID,
                contextValue: contextValue("notInstalled"),
                iconPath: robot("blue"),
                collapsibleState: TreeItemCollapsibleState.None,
                command: { title: "Install AI tools", command: INSTALL },
            };
        }
        const { icon, description, key } = statusRow(state.updateStatus, state.version);
        return {
            label: "AI tools",
            id: ROOT_ID,
            description: description ?? "",
            tooltip: `AI tools installed (${state.installLocation})`,
            contextValue: contextValue(key),
            iconPath: icon,
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
    }
}

/** An agent's row: installed (a check and its version), blocked (why), or installable. */
function agentRow(agent: AiToolsAgentStatus, scope: AiToolsScope): ConfigurationItem {
    const id = `${AGENT_ID_PREFIX}${agent.id}`;
    const base = { label: agent.displayName, id, collapsibleState: TreeItemCollapsibleState.None };
    if (agent.version !== undefined) {
        return {
            ...base,
            description: agent.skillsOnly ? `${agent.version} (skills only)` : agent.version,
            iconPath: new ThemeIcon("check", new ThemeColor("charts.green")),
            contextValue: contextValue("agent.installed"),
        };
    }
    const reason = agentInstallBlockReason(agent, scope);
    if (reason === "cliNotInstalled") {
        return {
            ...base,
            description: "CLI not installed",
            tooltip: `${agent.displayName} CLI is not installed. Install to set it up first.`,
            contextValue: contextValue("agent.notInstalled"),
            // Installing offers to install the agent's CLI first.
            command: {
                title: "Install AI tools for this agent",
                command: INSTALL_AGENT,
                arguments: [{ id }],
            },
        };
    }
    if (reason === "notDetected") {
        return {
            ...base,
            description: "Not detected",
            tooltip: `${agent.displayName} was not detected on this machine.`,
            iconPath: blocked(),
            contextValue: contextValue("agent.blocked"),
        };
    }
    if (reason === "scopeUnsupported") {
        return {
            ...base,
            description: "Only supports global scope",
            tooltip:
                "Only supports global-scope installs. Re-run “Install AI tools” and choose Global scope to add it.",
            iconPath: blocked(),
            contextValue: contextValue("agent.blocked"),
        };
    }
    return {
        ...base,
        description: "Not installed",
        contextValue: contextValue("agent.notInstalled"),
        // A click and the inline button pass the same argument.
        command: {
            title: "Install AI tools for this agent",
            command: INSTALL_AGENT,
            arguments: [{ id }],
        },
    };
}

function statusRow(
    status: AiToolsUpdateStatus,
    version?: string,
): { icon: ThemeIcon; description?: string; key: string } {
    const versionLabel = version ? `v${version.replace(/^v/, "")}` : undefined;
    switch (status) {
        case "upToDate":
            return {
                icon: robot("green"),
                description: versionLabel ?? "Up to date",
                key: "upToDate",
            };
        case "updateAvailable":
            return {
                icon: robot("green"),
                description: "Update available",
                key: "updateAvailable",
            };
        case "checking":
            return {
                icon: new ThemeIcon("sync~spin"),
                description: "Checking for updates",
                key: "checking",
            };
        case "updating":
            return { icon: new ThemeIcon("sync~spin"), description: "Updating", key: "updating" };
        case "error":
            return { icon: warning(), description: "Update check failed", key: "error" };
        default:
            return { icon: robot("green"), key: "installed" };
    }
}
