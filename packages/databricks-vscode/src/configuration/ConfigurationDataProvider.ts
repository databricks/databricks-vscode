import {
    Disposable,
    Event,
    EventEmitter,
    ProviderResult,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
} from "vscode";
import {ClusterListDataProvider} from "../cluster/ClusterListDataProvider";
import {ConnectionManager} from "./ConnectionManager";

type NodeType = "PROFILE" | "CLUSTER" | "WORKSPACE";

/**
 * Data provider for the cluster tree view
 */
export class ConfigurationDataProvider
    implements TreeDataProvider<TreeItem>, Disposable
{
    private _onDidChangeTreeData: EventEmitter<TreeItem | undefined | void> =
        new EventEmitter<TreeItem | undefined | void>();
    readonly onDidChangeTreeData: Event<TreeItem | undefined | void> =
        this._onDidChangeTreeData.event;

    private disposables: Array<Disposable> = [];

    constructor(private connectionManager: ConnectionManager) {
        this.disposables.push(
            this.connectionManager.onChangeState((state) => {
                this._onDidChangeTreeData.fire();
            }),
            this.connectionManager.onChangeCluster((cluster) => {
                console.log("change cluster event", cluster);
                this._onDidChangeTreeData.fire();
            })
        );
    }

    dispose() {}

    getTreeItem(element: TreeItem): TreeItem | Thenable<TreeItem> {
        return element;
    }

    getChildren(
        element?: TreeItem | undefined
    ): ProviderResult<Array<TreeItem>> {
        if (this.connectionManager.state !== "CONNECTED") {
            return [];
        }
        return (async () => {
            if (!element) {
                let cluster = this.connectionManager.cluster;
                let children: Array<TreeItem> = [];
                children.push({
                    label: `Profile: ${this.connectionManager.profile}`,
                    id: "CONNECTION",
                    collapsibleState: TreeItemCollapsibleState.None,
                });

                if (cluster) {
                    let clusterItem =
                        ClusterListDataProvider.clusterNodeToTreeItem(cluster);

                    children.push({
                        ...clusterItem,
                        label: `Cluster: ${cluster.name}`,
                        id: "CLUSTER",
                        collapsibleState: TreeItemCollapsibleState.Expanded,
                    });
                } else {
                    children.push({
                        label: `Cluster: "None attached"`,
                        id: "CLUSTER",
                        collapsibleState: TreeItemCollapsibleState.Expanded,
                    });
                }

                children.push({
                    label: "Workspace",
                    id: "WORKSPACE",
                    collapsibleState: TreeItemCollapsibleState.Expanded,
                });

                return children;
            }

            if (element.id === "CLUSTER") {
                let cluster = this.connectionManager.cluster;
                if (cluster) {
                    return ClusterListDataProvider.clusterNodeToTreeItems(
                        cluster
                    );
                }
            }
        })();
    }
}
