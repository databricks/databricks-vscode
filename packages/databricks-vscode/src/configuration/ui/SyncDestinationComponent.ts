import {posix} from "path/posix";
import {CodeSynchronizer} from "../../sync";
import {ConfigModel} from "../ConfigModel";
import {ConnectionManager} from "../ConnectionManager";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {TreeItemCollapsibleState, ThemeIcon, ThemeColor, window} from "vscode";

const TREE_ICON_ID = "WORKSPACE";
function getContextValue(key: string) {
    return `databricks.configuration.sync.${key}`;
}

function getTreeItemsForSyncState(codeSynchroniser: CodeSynchronizer) {
    let icon, contextValue;
    switch (codeSynchroniser.state) {
        case "IN_PROGRESS":
            icon = new ThemeIcon(
                "sync~spin",
                new ThemeColor("debugIcon.startForeground")
            );
            contextValue = getContextValue("running");
            break;

        case "STOPPED":
            icon = new ThemeIcon(
                "stop-circle",
                new ThemeColor("notificationsErrorIcon.foreground")
            );
            contextValue = getContextValue("stopped");
            break;

        case "WATCHING_FOR_CHANGES":
            icon = new ThemeIcon(
                "eye",
                new ThemeColor("debugIcon.startForeground")
            );
            contextValue = getContextValue("watching");
            break;

        default:
            icon = new ThemeIcon(
                "testing-error-icon",
                new ThemeColor("notificationsErrorIcon.foreground")
            );
            contextValue = getContextValue("error");
            break;
    }

    return {icon, contextValue};
}

/**
 * Component for displaying sync destination details. Sync destination is
 * always pulled from the bundle.
 */
export class SyncDestinationComponent extends BaseComponent {
    constructor(
        private readonly codeSynchronizer: CodeSynchronizer,
        private readonly connectionManager: ConnectionManager,
        private readonly configModel: ConfigModel
    ) {
        super();
        this.disposables.push(
            this.codeSynchronizer.onDidChangeState(() => {
                this.onDidChangeEmitter.fire();
            }),
            this.configModel.onDidChange("workspaceFsPath")(() => {
                this.onDidChangeEmitter.fire();
            })
        );
    }

    private async getRoot(): Promise<ConfigurationTreeItem[]> {
        const config = await this.configModel.get("workspaceFsPath");
        if (config === undefined) {
            // Workspace folder is not set in bundle and override
            // We are not logged in
            return [];
        }

        const {icon, contextValue} = getTreeItemsForSyncState(
            this.codeSynchronizer
        );

        return [
            {
                label: "Sync",
                description: posix.basename(config),
                collapsibleState: TreeItemCollapsibleState.Expanded,
                contextValue: contextValue,
                iconPath: icon,
                id: TREE_ICON_ID,
                url: this.connectionManager.workspaceClient
                    ? await this.connectionManager.syncDestinationMapper?.remoteUri.getUrl(
                          this.connectionManager.workspaceClient
                      )
                    : undefined,
            },
        ];
    }

    public async getChildren(
        parent?: ConfigurationTreeItem
    ): Promise<ConfigurationTreeItem[]> {
        if (this.connectionManager.state !== "CONNECTED") {
            return [];
        }
        if (parent === undefined) {
            return this.getRoot();
        }
        // If the parent is not intended for this component, return empty array
        if (parent.id !== TREE_ICON_ID) {
            return [];
        }
        const workspaceFsPath = await this.configModel.get("workspaceFsPath");

        if (workspaceFsPath === undefined) {
            return [];
        }
        //TODO: Disable syncing for prod/staging
        //TODO: Read sync destination from bundle. Infer from CLI if not set.

        const children: ConfigurationTreeItem[] = [
            {
                label: "Workspace Folder",
                description: posix.basename(workspaceFsPath),
                collapsibleState: TreeItemCollapsibleState.None,
            },
        ];

        // Only show details uptil here if not in dev mode.
        if ((await this.configModel.get("mode")) !== "development") {
            return children;
        }

        children.push({
            label: "State",
            description: this.codeSynchronizer.state,
            collapsibleState: TreeItemCollapsibleState.None,
        });

        const reason = this.codeSynchronizer.reason;
        if (reason !== undefined) {
            const label = "See full error";
            children.push({
                label: {
                    label,
                    highlights: [[0, label.length]],
                },
                collapsibleState: TreeItemCollapsibleState.None,
                command: {
                    title: "Call",
                    command: "databricks.call",
                    arguments: [
                        async () => {
                            window.showErrorMessage(reason);
                        },
                    ],
                },
            });
        }

        return children;
    }
}
