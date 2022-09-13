import {
    Disposable,
    Event,
    EventEmitter,
    ProviderResult,
    ThemeIcon,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
} from "vscode";
import {ClusterListDataProvider} from "../cluster/ClusterListDataProvider";
import {CodeSynchronizer} from "../sync/CodeSynchronizer";
import {ConnectionManager} from "./ConnectionManager";

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

    constructor(
        private connectionManager: ConnectionManager,
        private sync: CodeSynchronizer
    ) {
        this.disposables.push(
            this.connectionManager.onDidChangeState(() => {
                this._onDidChangeTreeData.fire();
            }),
            this.connectionManager.onDidChangeCluster(() => {
                this._onDidChangeTreeData.fire();
            }),
            this.connectionManager.onDidChangeSyncDestination(() => {
                this._onDidChangeTreeData.fire();
            }),
            this.sync.onDidChangeState(() => {
                this._onDidChangeTreeData.fire();
            })
        );
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }

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
            let cluster = this.connectionManager.cluster;
            let syncDestination = this.connectionManager.syncDestination;

            if (!element) {
                let children: Array<TreeItem> = [];
                children.push({
                    label: `Profile`,
                    iconPath: new ThemeIcon("tools"),
                    id: "PROFILE",
                    collapsibleState: TreeItemCollapsibleState.Expanded,
                });

                if (cluster) {
                    children.push({
                        label: `Cluster`,
                        iconPath: new ThemeIcon("server"),
                        id: "CLUSTER",
                        collapsibleState: TreeItemCollapsibleState.Expanded,
                        contextValue: "clusterAttached",
                    });
                } else {
                    children.push({
                        label: `Cluster - "None attached"`,
                        iconPath: new ThemeIcon("server"),
                        id: "CLUSTER",
                        collapsibleState: TreeItemCollapsibleState.Expanded,
                        contextValue: "clusterDetached",
                    });
                }

                if (syncDestination) {
                    children.push({
                        label: `Workspace`,
                        iconPath: new ThemeIcon("repo"),
                        id: "WORKSPACE",
                        collapsibleState: TreeItemCollapsibleState.Expanded,
                        contextValue:
                            this.sync.state === "RUNNING"
                                ? "syncRunning"
                                : "syncStopped",
                    });
                } else {
                    children.push({
                        label: `Workspace - "None attached"`,
                        iconPath: new ThemeIcon("repo"),
                        id: "WORKSPACE",
                        collapsibleState: TreeItemCollapsibleState.Expanded,
                        contextValue: "syncDetached",
                    });
                }

                return children;
            }

            if (element.id === "PROFILE" && this.connectionManager.profile) {
                return [
                    {
                        label: "Name",
                        description: this.connectionManager.profile,
                        collapsibleState: TreeItemCollapsibleState.None,
                    },
                ];
            }

            if (element.id === "CLUSTER" && cluster) {
                let clusterItem =
                    ClusterListDataProvider.clusterNodeToTreeItem(cluster);

                return [
                    {
                        label: "Name:",
                        description: cluster.name,
                        iconPath: clusterItem.iconPath,
                        collapsibleState: TreeItemCollapsibleState.None,
                    },
                    ...ClusterListDataProvider.clusterNodeToTreeItems(cluster),
                ];
            }

            if (element.id === "WORKSPACE" && syncDestination) {
                return [
                    {
                        label: `Sync state:`,
                        description: this.sync.state,
                        iconPath:
                            this.sync.state === "RUNNING"
                                ? new ThemeIcon("debug-start")
                                : new ThemeIcon("debug-stop"),
                        collapsibleState: TreeItemCollapsibleState.None,
                    },
                    {
                        label: `Name:`,
                        description: syncDestination.name,
                        collapsibleState: TreeItemCollapsibleState.None,
                    },
                    {
                        label: `Path:`,
                        description: syncDestination.path.path,
                        collapsibleState: TreeItemCollapsibleState.None,
                    },
                ];
            }
        })();
    }
}
