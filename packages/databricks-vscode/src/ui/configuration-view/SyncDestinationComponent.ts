import {ConfigModel} from "../../configuration/models/ConfigModel";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {TreeItemCollapsibleState, ThemeIcon, ThemeColor, window} from "vscode";
import {DecorationUtils} from "../utils";
import {CodeSynchronizer} from "../../sync";

const TREE_ICON_ID = "WORKSPACE";

/**
 * Component for displaying sync destination details. Sync destination is
 * always pulled from the bundle.
 */

function getIconForSyncState(codeSynchroniser: CodeSynchronizer) {
    switch (codeSynchroniser.state) {
        case "IN_PROGRESS":
            return new ThemeIcon(
                "sync~spin",
                new ThemeColor("debugIcon.startForeground")
            );

        case "STOPPED":
            return new ThemeIcon(
                "folder-active",
                new ThemeColor("charts.green")
            );

        case "WATCHING_FOR_CHANGES":
            return new ThemeIcon(
                "eye",
                new ThemeColor("debugIcon.startForeground")
            );

        default:
            return new ThemeIcon(
                "testing-error-icon",
                new ThemeColor("notificationsErrorIcon.foreground")
            );
    }
}
export class SyncDestinationComponent extends BaseComponent {
    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly configModel: ConfigModel,
        private readonly codeSynchronizer: CodeSynchronizer
    ) {
        super();
        this.disposables.push(
            this.configModel.onDidChangeTarget(() => {
                this.onDidChangeEmitter.fire();
            }),
            this.connectionManager.onDidChangeState(() => {
                this.onDidChangeEmitter.fire();
            }),
            this.configModel.onDidChangeKey("remoteRootPath")(async () => {
                this.onDidChangeEmitter.fire();
            }),
            this.configModel.onDidChangeKey("remoteStateConfig")(async () => {
                this.onDidChangeEmitter.fire();
            }),
            this.codeSynchronizer.onDidChangeState(() => {
                this.onDidChangeEmitter.fire();
            })
        );
    }

    async getUrl() {
        return this.connectionManager.workspaceClient
            ? await this.connectionManager.syncDestinationMapper?.remoteUri.getUrl(
                  this.connectionManager.workspaceClient
              )
            : undefined;
    }
    private async getRoot(): Promise<ConfigurationTreeItem[]> {
        const workspaceFsPath = await this.configModel.get("remoteRootPath");

        if (workspaceFsPath === undefined) {
            return [];
        }

        let contextValue = "databricks.configuration.sync";
        const url = await this.getUrl();
        contextValue = url ? `${contextValue}.has-url` : contextValue;
        contextValue = this.codeSynchronizer.isRunning
            ? `${contextValue}.is-running`
            : `${contextValue}.is-stopped`;

        return [
            {
                label: "Workspace Folder",
                tooltip: url ? undefined : "Created after deploy",
                collapsibleState: TreeItemCollapsibleState.Collapsed,
                contextValue,
                iconPath: getIconForSyncState(this.codeSynchronizer),
                resourceUri: url
                    ? undefined
                    : DecorationUtils.getModifiedStatusDecoration(
                          TREE_ICON_ID,
                          "created"
                      ),
                id: TREE_ICON_ID,
                url: url,
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

        if (parent.id !== TREE_ICON_ID) {
            return [];
        }

        const workspaceFsPath = await this.configModel.get("remoteRootPath");
        const pathTreeItem: ConfigurationTreeItem = {
            label: "Path",
            description: workspaceFsPath,
        };

        if (
            this.codeSynchronizer.state === "ERROR" &&
            this.codeSynchronizer.reason
        ) {
            return [
                pathTreeItem,
                {
                    description: "Error - Click for more details",
                    iconPath: new ThemeIcon(
                        "alert",
                        new ThemeColor("errorForeground")
                    ),
                    tooltip: "Click for more details",

                    command: {
                        title: "Call",
                        command: "databricks.call",
                        arguments: [
                            () => {
                                window.showErrorMessage(
                                    `Sync Error: ${this.codeSynchronizer.reason}`
                                );
                            },
                        ],
                    },
                },
            ];
        }

        return [
            pathTreeItem,
            {
                label: `State`,
                description: this.codeSynchronizer.state,
                collapsibleState: TreeItemCollapsibleState.None,
            },
        ];
    }
}
