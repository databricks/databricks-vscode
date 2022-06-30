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

type NODE_TYPE = "PROFILE" | "CLUSTER" | "WORKSPACE";

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
                let cluster = await this.connectionManager.getCluster();
                return [
                    {
                        label: `Profile: ${this.connectionManager.profile}`,
                        id: "CONNECTION",
                        collapsibleState: TreeItemCollapsibleState.None,
                    },
                    {
                        label: `Cluster: ${
                            cluster ? cluster.name : "None attached"
                        }`,
                        id: "CLUSTER",
                        collapsibleState: cluster
                            ? TreeItemCollapsibleState.Expanded
                            : TreeItemCollapsibleState.None,
                    },
                    {
                        label: "Workspace",
                        id: "WORKSPACE",
                        collapsibleState: TreeItemCollapsibleState.Expanded,
                    },
                ];
            }

            if (element.id === "CLUSTER") {
                let cluster = await this.connectionManager.getCluster();
                if (cluster) {
                    return ClusterListDataProvider.clusterNodeToTreeItems(
                        cluster
                    );
                }
            }
        })();
    }
}
