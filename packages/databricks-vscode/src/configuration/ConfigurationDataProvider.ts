import {
    Disposable,
    Event,
    EventEmitter,
    ThemeColor,
    ThemeIcon,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
} from "vscode";

import {BundleModel} from "../bundle/BundleModel";
import {ClusterModel} from "../cluster/ClusterModel";

export type ConfigurationTreeItem = TreeItem & {
    url?: string;
};

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

    constructor(
        private readonly bundleModel: BundleModel,
        private readonly clusterModel: ClusterModel
    ) {
        this.disposables.push(
            this.bundleModel.onDidChangeBundleData(() => {
                this._onDidChangeTreeData.fire();
            }),
            this.bundleModel.onDidChangeSelectedTarget(() => {
                this._onDidChangeTreeData.fire();
            }),
            this.bundleModel.onDidChangeConfigurations(() => {
                this._onDidChangeTreeData.fire();
            })
        );
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }

    getTreeItem(element: ConfigurationTreeItem): TreeItem | Thenable<TreeItem> {
        return element;
    }

    async getChildren(
        element?: ConfigurationTreeItem | undefined
    ): Promise<Array<ConfigurationTreeItem>> {
        const {authType, computeId, syncDestination} =
            await this.bundleModel.getConfigurations();

        if (!element) {
            const children: Array<ConfigurationTreeItem> = [];
            children.push({
                label: `Auth Type`,
                description: authType ?? "Not Selected",
                iconPath: new ThemeIcon("account"),
                id: "AUTHTYPE",
                collapsibleState: TreeItemCollapsibleState.None,
                contextValue: "databricks.configuration.authType",
            });

            children.push({
                label: `Cluster`,
                description: computeId ?? "Not Selected",
                iconPath: new ThemeIcon("server"),
                id: "CLUSTER",
                collapsibleState: TreeItemCollapsibleState.Expanded,
                contextValue: "databricks.configuration.cluster",
            });

            children.push({
                label: `Sync Destination`,
                iconPath: new ThemeIcon("file-directory"),
                id: "SYNC-DESTINATION",
                collapsibleState: TreeItemCollapsibleState.Expanded,
                contextValue: "databricks.configuration.syncDestination",
            });

            return children;
        }

        if (element.id?.startsWith("CLUSTER") && computeId) {
            const cluster = this.clusterModel.getClusterDetails(computeId);
            let icon: ThemeIcon | undefined;
            switch (cluster?.state) {
                case "RESIZING":
                case "RUNNING":
                    icon = new ThemeIcon("debug-start");
                    break;

                case "RESTARTING":
                case "PENDING":
                    icon = new ThemeIcon("debug-restart");
                    break;

                case "TERMINATING":
                    icon = new ThemeIcon(
                        "stop-circle",
                        new ThemeColor("notificationsErrorIcon.foreground")
                    );
                    break;

                case "TERMINATED":
                case "ERROR":
                case "UNKNOWN":
                    icon = new ThemeIcon("debug-stop");
                    break;
            }

            const children: ConfigurationTreeItem[] = [
                {
                    label: "Name",
                    description: cluster?.cluster_name,
                    iconPath: icon,
                    collapsibleState: TreeItemCollapsibleState.None,
                },
            ];

            children.push(
                {
                    label: "Creator",
                    description: cluster?.creator_user_name,
                    collapsibleState: TreeItemCollapsibleState.None,
                },
                {
                    label: "State",
                    description: cluster?.state,
                    collapsibleState: TreeItemCollapsibleState.None,
                },
                {
                    label: "Cluster ID",
                    description: cluster?.cluster_id,
                    collapsibleState: TreeItemCollapsibleState.None,
                }
            );
            return children;
        }

        if (element.id === "SYNC-DESTINATION") {
            return [
                {
                    label: "State",
                    description: "In Progress",
                    collapsibleState: TreeItemCollapsibleState.None,
                },
                {
                    label: "Path",
                    description: syncDestination,
                    collapsibleState: TreeItemCollapsibleState.None,
                },
            ];
        }

        return [];
    }
}
