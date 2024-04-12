import {ConfigModel} from "../models/ConfigModel";
import {ConnectionManager} from "../ConnectionManager";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {TreeItemCollapsibleState, ThemeIcon, ThemeColor} from "vscode";
import {DecorationUtils} from "../../ui/bundle-resource-explorer/utils";

const TREE_ICON_ID = "WORKSPACE";

/**
 * Component for displaying sync destination details. Sync destination is
 * always pulled from the bundle.
 */
export class SyncDestinationComponent extends BaseComponent {
    constructor(
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
            }),
            this.configModel.onDidChangeKey("remoteStateConfig")(() => {
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

        const contextValue = "databricks.configuration.sync";
        const url = await this.getUrl();

        return [
            {
                label: "Workspace Folder",
                tooltip: url ? undefined : "Created after deploy",
                description: workspaceFsPath,
                collapsibleState: TreeItemCollapsibleState.None,
                contextValue: url ? `${contextValue}.has-url` : contextValue,
                iconPath: new ThemeIcon(
                    "folder-active",
                    new ThemeColor("charts.green")
                ),
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

        return [];
    }
}
