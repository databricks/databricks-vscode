import {ThemeColor, ThemeIcon, TreeItemCollapsibleState} from "vscode";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {
    AiToolsManager,
    AiToolsUpdateStatus,
} from "../../aitools/AiToolsManager";

const AITOOLS_COMPONENT_ID = "AITOOLS";

/**
 * Robot icon used as the AI tools row's identity, in a theme-aware color:
 * blue before the tools are installed, green once they are.
 */
function robotIcon(color: "blue" | "green") {
    return new ThemeIcon("hubot", new ThemeColor(`charts.${color}`));
}

function getContextValue(key: string) {
    return `databricks.configuration.aitools.${key}`;
}

export class AiToolsComponent extends BaseComponent {
    constructor(private readonly aiToolsManager: AiToolsManager) {
        super();
        this.disposables.push(
            this.aiToolsManager.onDidChange(() => {
                this.onDidChangeEmitter.fire();
            })
        );
    }

    private getRoot(): ConfigurationTreeItem[] {
        const {installLocation, updateStatus, version, detectError} =
            this.aiToolsManager.state;

        // Detection failed with an unexpected error and we have no cached
        // location to fall back on -> show a reload affordance rather than
        // implying the tools simply aren't installed.
        if (installLocation === undefined && detectError) {
            return [
                {
                    label: "AI tools",
                    id: AITOOLS_COMPONENT_ID,
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

        // Not installed -> prompt to install.
        if (installLocation === undefined) {
            return [
                {
                    label: "Install AI tools",
                    id: AITOOLS_COMPONENT_ID,
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
                id: AITOOLS_COMPONENT_ID,
                description: `${installLocation}${
                    description ? ` · ${description}` : ""
                }`,
                tooltip: `AI tools installed (${installLocation})`,
                contextValue: getContextValue(state),
                iconPath: icon,
                collapsibleState: TreeItemCollapsibleState.None,
                // Updates are applied automatically on activation, so the row
                // is not clickable — it only reflects status.
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
        // A single top-level AI tools row with no children. This feature is
        // independent of the cluster connection state.
        if (parent !== undefined) {
            return [];
        }
        return this.getRoot();
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
                // Stable installed state: the green robot is the row's resting
                // identity.
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
            // Transient: spinner conveys in-progress work.
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
