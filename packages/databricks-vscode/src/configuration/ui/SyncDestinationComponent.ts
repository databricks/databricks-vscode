import {posix} from "path/posix";
import {CodeSynchronizer} from "../../sync";
import {ConfigModel} from "../models/ConfigModel";
import {ConnectionManager} from "../ConnectionManager";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {TreeItemCollapsibleState, ThemeIcon, ThemeColor} from "vscode";

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
            this.configModel.onDidChangeTarget(() => {
                this.onDidChangeEmitter.fire();
            }),
            this.connectionManager.onDidChangeState(() => {
                this.onDidChangeEmitter.fire();
            }),
            this.configModel.onDidChangeKey("remoteRootPath")(() => {
                this.onDidChangeEmitter.fire();
            })
        );
    }

    private async getRoot(): Promise<ConfigurationTreeItem[]> {
        const config = await this.configModel.get("remoteRootPath");
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
                description: posix.basename(posix.dirname(config)),
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
        const workspaceFsPath = await this.configModel.get("remoteRootPath");

        if (workspaceFsPath === undefined) {
            return [];
        }
        //TODO: Disable syncing for all targets (dev/staging/prod)

        const children: ConfigurationTreeItem[] = [
            {
                label: "Workspace Folder",
                description: workspaceFsPath,
                collapsibleState: TreeItemCollapsibleState.None,
            },
        ];

        return children;
    }
}
