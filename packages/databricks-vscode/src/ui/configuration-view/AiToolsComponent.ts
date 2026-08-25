import {ThemeColor, ThemeIcon, TreeItemCollapsibleState} from "vscode";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {CURSOR_AGENT_ID} from "../../aitools/AiToolsManager";
import {
    AiToolsAgentStatus,
    AiToolsModel,
    AiToolsUpdateStatus,
    agentInstallBlockReason,
} from "../../aitools/AiToolsModel";
import {AiToolsScope} from "../../cli/CliWrapper";
import {HostUtils} from "../../utils";

const TREE_ICON_ID = "AITOOLS";

function getTreeIconId(key: string) {
    return `${TREE_ICON_ID}.${key}`;
}

function robotIcon(color: "blue" | "green") {
    return new ThemeIcon("hubot", new ThemeColor(`charts.${color}`));
}

/** Muted icon for an agent that can't be installed at the current scope. */
function blockedIcon() {
    return new ThemeIcon("circle-slash", new ThemeColor("disabledForeground"));
}

function getContextValue(key: string) {
    return `databricks.configuration.aitools.${key}`;
}

/**
 * Agents that should not be listed under the Agents node. In Cursor the Cursor
 * plugin is managed via the marketplace modal (surfaced as a button on the
 * top-level AI tools row), so listing "Cursor" as an agent here would be
 * redundant and confusing.
 */
function isHiddenAgent(agentId: string): boolean {
    return agentId === CURSOR_AGENT_ID && HostUtils.isCursor();
}

/**
 * Map an agent to its Agents-list row presentation for the current install
 * scope, folding in the three states:
 *  - installed: green check + version (annotated "skills only" when a managed
 *    agent only received the raw skills);
 *  - blocked: a muted icon + short reason (not detected / scope unsupported),
 *    explained in the tooltip, with no install affordance;
 *  - installable: "Not installed" with the inline install button / clickable
 *    row (see the `agent.notInstalled` context value in package.json).
 *
 * The blocked decision is shared with the install picker via
 * {@link agentInstallBlockReason} so the two surfaces stay in lockstep.
 */
function describeAgentRow(
    agent: AiToolsAgentStatus,
    installLocation: AiToolsScope
): {
    description: string;
    tooltip?: string;
    iconPath?: ThemeIcon;
    contextValue: string;
    installable: boolean;
} {
    if (agent.version !== undefined) {
        return {
            description: agent.skillsOnly
                ? `${agent.version} (skills only)`
                : agent.version,
            iconPath: new ThemeIcon("check", new ThemeColor("charts.green")),
            contextValue: getContextValue("agent.installed"),
            installable: false,
        };
    }
    const reason = agentInstallBlockReason(agent, installLocation);
    if (reason === "notDetected") {
        return {
            description: "Not detected",
            tooltip: `${agent.displayName} was not detected on this machine.`,
            iconPath: blockedIcon(),
            contextValue: getContextValue("agent.blocked"),
            installable: false,
        };
    }
    if (reason === "scopeUnsupported") {
        return {
            description: "Only supports global scope",
            tooltip:
                "Only supports global-scope installs. Re-run “Install AI tools” and choose Global scope to add it.",
            iconPath: blockedIcon(),
            contextValue: getContextValue("agent.blocked"),
            installable: false,
        };
    }
    return {
        description: "Not installed",
        contextValue: getContextValue("agent.notInstalled"),
        installable: true,
    };
}

export class AiToolsComponent extends BaseComponent {
    constructor(private readonly aiToolsModel: AiToolsModel) {
        super();
        this.disposables.push(
            this.aiToolsModel.onDidChange(() => {
                this.onDidChangeEmitter.fire();
            })
        );
    }

    private getRoot(): ConfigurationTreeItem[] {
        const {installLocation, updateStatus, version, detectError} =
            this.aiToolsModel.state;

        // Detection failed with an unexpected error -> show a reload affordance
        // rather than implying the tools simply aren't installed. We ignore any
        // cached installLocation here: otherwise we'd render a collapsible
        // "installed" row that expands to nothing (getChildren returns [] on
        // detectError), which is more confusing than surfacing the error.
        if (detectError) {
            return [
                {
                    label: "AI tools",
                    id: TREE_ICON_ID,
                    description:
                        "Failed to check installation · click to retry",
                    tooltip:
                        "Failed to check the Databricks AI tools installation. Click to retry.",
                    contextValue: getContextValue("error"),
                    iconPath: new ThemeIcon(
                        "warning",
                        new ThemeColor("errorForeground")
                    ),
                    collapsibleState: TreeItemCollapsibleState.None,
                    command: {
                        title: "Retry AI tools detection",
                        command: "databricks.aitools.reload",
                    },
                },
            ];
        }

        if (installLocation === undefined) {
            return [
                {
                    label: "Install AI tools",
                    id: TREE_ICON_ID,
                    contextValue: getContextValue("notInstalled"),
                    iconPath: robotIcon("blue"),
                    collapsibleState: TreeItemCollapsibleState.None,
                    command: {
                        title: "Install AI tools",
                        command: "databricks.aitools.install",
                    },
                },
            ];
        }

        const {icon, description, state} = getTreeItemsForUpdateStatus(
            updateStatus,
            version
        );
        const items: ConfigurationTreeItem[] = [
            {
                label: "AI tools",
                id: TREE_ICON_ID,
                description: description ?? "",
                tooltip: `AI tools installed (${installLocation})`,
                contextValue: getContextValue(state),
                iconPath: icon,
                collapsibleState: TreeItemCollapsibleState.Collapsed,
            },
        ];

        // The "add Databricks plugin to Cursor" action is rendered as an inline
        // button on this row (see package.json view/item/context menus), gated
        // on the databricks.context.aitools.showCursorPlugin context key.

        return items;
    }

    public async getChildren(
        parent?: ConfigurationTreeItem
    ): Promise<ConfigurationTreeItem[]> {
        const {installLocation, version, detectError, agents} =
            this.aiToolsModel.state;
        // Only the tree root gets the AI tools row. Guarding solely on
        // `parent === undefined` is important: ConfigurationDataProvider fans
        // every getChildren(parent) call out to all components and flattens the
        // results, so returning the root row for a foreign parent (e.g. when a
        // cluster/auth node is expanded) would register a second element with
        // id "AITOOLS" and throw "Element with id AITOOLS is already
        // registered".
        if (parent === undefined) {
            return this.getRoot();
        }

        // The child rows below only exist under an installed, expandable AI
        // tools row. When nothing is installed (or detection errored) the root
        // row is non-collapsible, so it is never expanded and these branches
        // are unreachable for our own nodes; bail out for any other parent.
        if (installLocation === undefined || detectError) {
            return [];
        }

        if (parent.id === TREE_ICON_ID) {
            // In Cursor, the Cursor plugin is installed via the marketplace
            // modal (the button on the top-level AI tools row), not the CLI, so
            // it never appears as a manageable agent under the Agents node.
            const visibleAgents = agents.filter((a) => !isHiddenAgent(a.id));
            const installedAgents = visibleAgents.filter(
                (a) => a.version !== undefined
            ).length;
            return [
                {
                    label: "Scope",
                    id: getTreeIconId("scope"),
                    description: installLocation,
                    collapsibleState: TreeItemCollapsibleState.None,
                },
                version !== undefined && {
                    label: "Version",
                    id: getTreeIconId("version"),
                    description: version,
                    collapsibleState: TreeItemCollapsibleState.None,
                },
                agents.length > 0 && {
                    label: "Agents",
                    id: getTreeIconId("agents"),
                    description: `${installedAgents} installed`,
                    collapsibleState: TreeItemCollapsibleState.Expanded,
                },
            ].filter(Boolean) as ConfigurationTreeItem[];
        }
        if (parent.id === getTreeIconId("agents")) {
            return agents
                .filter((agent) => !isHiddenAgent(agent.id))
                .map((agent) => {
                    const id = getTreeIconId(`agent.${agent.id}`);
                    const {
                        description,
                        tooltip,
                        iconPath,
                        contextValue,
                        installable,
                    } = describeAgentRow(agent, installLocation);
                    return {
                        label: agent.displayName,
                        id,
                        description,
                        tooltip,
                        // A green check marks installed agents; installable ones
                        // get an inline install button (see package.json
                        // view/item/context) keyed on the `agent.notInstalled`
                        // context value, and clicking the row installs the agent
                        // too. Blocked rows use `agent.blocked`, which that
                        // when-clause doesn't match, so they get no button.
                        contextValue,
                        iconPath,
                        command: installable
                            ? {
                                  title: "Install AI tools for this agent",
                                  command: "databricks.aitools.installAgent",
                                  // The handler recovers the agent id from the
                                  // node id; pass the node explicitly so a click
                                  // and the inline button behave identically.
                                  arguments: [{id}],
                              }
                            : undefined,
                        collapsibleState: TreeItemCollapsibleState.None,
                    };
                });
        }

        return [];
    }
}

function getTreeItemsForUpdateStatus(
    status: AiToolsUpdateStatus,
    version?: string
): {
    icon: ThemeIcon;
    description?: string;
    state: string;
} {
    // When we know the installed release, show it (e.g. "v0.2.9") rather than a
    // generic "Up to date" label.
    const versionLabel = version ? `v${version.replace(/^v/, "")}` : undefined;
    switch (status) {
        case "upToDate":
            return {
                icon: robotIcon("green"),
                description: versionLabel ?? "Up to date",
                state: "upToDate",
            };
        case "updateAvailable":
            return {
                icon: robotIcon("green"),
                description: "Update available",
                state: "updateAvailable",
            };
        case "checking":
            return {
                icon: new ThemeIcon("sync~spin"),
                description: "Checking for updates",
                state: "checking",
            };
        case "updating":
            return {
                icon: new ThemeIcon("sync~spin"),
                description: "Updating",
                state: "updating",
            };
        case "error":
            return {
                icon: new ThemeIcon(
                    "warning",
                    new ThemeColor("errorForeground")
                ),
                description: "Update check failed",
                state: "error",
            };
        case "unknown":
        default:
            return {
                icon: robotIcon("green"),
                state: "installed",
            };
    }
}
