import {
    Disposable,
    Event,
    EventEmitter,
    TreeDataProvider,
    TreeItem,
    ThemeIcon,
    ThemeColor,
} from "vscode";

import {ConnectionManager} from "../ConnectionManager";
import {ConfigModel} from "../ConfigModel";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {BundleTargetComponent} from "./BundleTargetComponent";
import {AuthTypeComponent} from "./AuthTypeComponent";
import {ClusterComponent} from "./ClusterComponent";
import {WorkspaceComponent} from "./WorkspaceComponent";
import {CodeSynchronizer} from "../../sync";

/**
 * Data provider for the cluster tree view
 */
export class ConfigurationDataProvider
    implements TreeDataProvider<ConfigurationTreeItem>, Disposable
{
    private _onDidChangeTreeData: EventEmitter<
        ConfigurationTreeItem | undefined | void
    > = new EventEmitter<ConfigurationTreeItem | undefined | void>();
    readonly onDidChangeTreeData: Event<
        ConfigurationTreeItem | undefined | void
    > = this._onDidChangeTreeData.event;

    private disposables: Array<Disposable> = [];
    private components: Array<BaseComponent> = [];
    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly codeSynchronizer: CodeSynchronizer,
        private readonly configModel: ConfigModel
    ) {
        this.components.push(
            new BundleTargetComponent(this.configModel),
            new AuthTypeComponent(this.connectionManager, this.configModel),
            new ClusterComponent(this.connectionManager, this.configModel),
            new WorkspaceComponent(
                this.codeSynchronizer,
                this.connectionManager,
                this.configModel
            )
        );

        this.disposables.push(
            ...this.components,
            ...this.components.map((c) =>
                c.onDidChange(() => {
                    this._onDidChangeTreeData.fire();
                })
            )
        );
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }

    getTreeItem(element: ConfigurationTreeItem): TreeItem | Thenable<TreeItem> {
        return element;
    }

    async getChildren(
        parent?: ConfigurationTreeItem | undefined
    ): Promise<Array<ConfigurationTreeItem>> {
        switch (this.connectionManager.state) {
            case "DISCONNECTED":
            case "CONNECTED":
                break;
            case "CONNECTING":
                await this.connectionManager.waitForConnect();
                break;
        }

        return (
            await Promise.all(this.components.map((c) => c.getChildren(parent)))
        )
            .map((items) => {
                if (
                    parent?.source === undefined ||
                    parent.source === "default" ||
                    items.length === 0
                ) {
                    return items;
                }

                const tooltip = {
                    bundle: "This configuration is loaded from a Databricks Asset Bundle.",
                    override:
                        "This configuration is a workspace only override.",
                }[parent.source];
                return [
                    {
                        label: "Source",
                        description: parent.source,
                        iconPath: new ThemeIcon("info", new ThemeColor("info")),
                        tooltip,
                    },
                    ...items,
                ];
            })
            .flat()
            .map((item) => {
                if (item.source === undefined || item.source === "default") {
                    return item;
                }
                const tooltip = {
                    bundle: "This configuration is loaded from a Databricks Asset Bundle.",
                    override:
                        "This configuration is a workspace only override.",
                }[item.source];
                return {
                    ...item,
                    tooltip,
                };
            });
        // if (element.id === "SYNC-DESTINATION" && syncDestination) {
        //     const children: Array<TreeItem> = [
        //         {
        //             label: `Name`,
        //             description: syncDestination.remoteUri.name,
        //             iconPath:
        //                 this.sync.state === "WATCHING_FOR_CHANGES" ||
        //                 this.sync.state === "IN_PROGRESS"
        //                     ? new ThemeIcon("debug-start")
        //                     : new ThemeIcon("debug-stop"),
        //             collapsibleState: TreeItemCollapsibleState.None,
        //         },
        //     ];

        //     if (
        //         workspaceConfigs.syncDestinationType === "repo" &&
        //         this.wsfsAccessVerifier.isEnabled
        //     ) {
        //         const label = "Switch to workspace";
        //         children.push({
        //             label: {
        //                 highlights: [[0, label.length]],
        //                 label,
        //             },
        //             tooltip: "Click to switch to workspace",
        //             iconPath: new ThemeIcon(
        //                 "warning",
        //                 new ThemeColor("problemsWarningIcon.foreground")
        //             ),
        //             command: {
        //                 title: "Call",
        //                 command: "databricks.call",
        //                 arguments: [
        //                     () => {
        //                         switchToWorkspacePrompt(
        //                             this.stateStorage,
        //                             this.telemetry
        //                         );
        //                     },
        //                 ],
        //             },
        //         });
        //     }

        //     const errorOverrides: TreeItem =
        //         this.sync.state === "ERROR" && this.sync.reason
        //             ? {
        //                   description: "Error - Click for more details",
        //                   iconPath: new ThemeIcon(
        //                       "alert",
        //                       new ThemeColor("errorForeground")
        //                   ),
        //                   tooltip: "Click for more details",

        //                   command: {
        //                       title: "Call",
        //                       command: "databricks.call",
        //                       arguments: [
        //                           () => {
        //                               window.showErrorMessage(
        //                                   `Sync Error: ${this.sync.reason}`
        //                               );
        //                           },
        //                       ],
        //                   },
        //               }
        //             : {};
        //     children.push(
        //         {
        //             label: `State`,
        //             description: this.sync.state,
        //             collapsibleState: TreeItemCollapsibleState.None,
        //             ...errorOverrides,
        //         },
        //         {
        //             label: `Path`,
        //             description: syncDestination.remoteUri.path,
        //             collapsibleState: TreeItemCollapsibleState.None,
        //         }
        //     );

        //     return children;
        // }

        return [];
    }
}
