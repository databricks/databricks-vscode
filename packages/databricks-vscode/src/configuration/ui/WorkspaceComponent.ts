import {posix} from "path/posix";
import {CodeSynchronizer} from "../../sync";
import {ConfigModel} from "../ConfigModel";
import {ConnectionManager} from "../ConnectionManager";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {TreeItemCollapsibleState, ThemeIcon, ThemeColor, window} from "vscode";

const TREE_ICON_ID = "WORKSPACE";
function getContextValue(key: string) {
    return `databricks.configuration.workspaceFsPath.${key}`;
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

export class WorkspaceComponent extends BaseComponent {
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
            this.configModel.onDidChange("workspaceFsPath", () => {
                this.onDidChangeEmitter.fire();
            })
        );
    }

    private async getRoot(): Promise<ConfigurationTreeItem[]> {
        const config = await this.configModel.getS("workspaceFsPath");
        if (config?.config === undefined) {
            // Workspace folder is not set in bundle and override
            // We are not logged in
            if (this.connectionManager.state !== "CONNECTED") {
                return [];
            }

            // Workspace folder is not set in bundle and override
            // We are logged in
            const label = "Select a workspace folder";
            return [
                {
                    label: {
                        label,
                        highlights: [[0, label.length]],
                    },
                    collapsibleState: TreeItemCollapsibleState.Expanded,
                    contextValue: getContextValue("none"),
                    iconPath: new ThemeIcon(
                        "folder",
                        new ThemeColor("notificationsErrorIcon.foreground")
                    ),
                    id: TREE_ICON_ID,
                },
            ];
        }

        const {config: workspaceFsFolder, source} = config;

        const {icon, contextValue} = getTreeItemsForSyncState(
            this.codeSynchronizer
        );

        // Workspace Folder is set in bundle / override
        // We are not logged in
        if (this.connectionManager.state !== "CONNECTED") {
            return [
                {
                    label: "Sync",
                    description: posix.basename(workspaceFsFolder),
                    collapsibleState: TreeItemCollapsibleState.Expanded,
                    contextValue: getContextValue("selected"),
                    iconPath: icon,
                    source: source,
                    id: TREE_ICON_ID,
                },
            ];
        }

        return [
            {
                label: "Sync",
                description: posix.basename(workspaceFsFolder),
                collapsibleState: TreeItemCollapsibleState.Expanded,
                contextValue: contextValue,
                iconPath: icon,
                source: source,
                id: TREE_ICON_ID,
            },
        ];
    }

    public async getChildren(
        parent?: ConfigurationTreeItem
    ): Promise<ConfigurationTreeItem[]> {
        if (parent === undefined) {
            return this.getRoot();
        }
        if (parent.id !== TREE_ICON_ID) {
            return [];
        }
        if (this.connectionManager.state !== "CONNECTED") {
            return [];
        }
        const workspaceFsPath = await this.configModel.get("workspaceFsPath");

        if (workspaceFsPath === undefined) {
            return [];
        }

        const children: ConfigurationTreeItem[] = [
            {
                label: "Workspace Folder",
                description: posix.basename(workspaceFsPath),
                collapsibleState: TreeItemCollapsibleState.None,
            },
            {
                label: "State",
                description: this.codeSynchronizer.state,
                collapsibleState: TreeItemCollapsibleState.None,
            },
        ];

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
