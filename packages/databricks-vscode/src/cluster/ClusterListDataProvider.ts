import {
    Disposable,
    Event,
    EventEmitter,
    ProviderResult,
    ThemeColor,
    ThemeIcon,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
} from "vscode";
import {Cluster} from "@databricks/databricks-sdk";
import {ClusterModel} from "./ClusterModel";

/**
 * Data provider for the cluster tree view
 */
export class ClusterListDataProvider
    implements TreeDataProvider<Cluster | TreeItem>, Disposable
{
    private _onDidChangeTreeData: EventEmitter<
        Cluster | TreeItem | undefined | void
    > = new EventEmitter<Cluster | TreeItem | undefined | void>();
    readonly onDidChangeTreeData: Event<Cluster | TreeItem | undefined | void> =
        this._onDidChangeTreeData.event;

    private disposables: Array<Disposable>;

    constructor(private model: ClusterModel) {
        this.disposables = [
            model.onDidChange(() => {
                this._onDidChangeTreeData.fire();
            }),
        ];
        this.model.refresh();
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }

    getTreeItem(element: Cluster | TreeItem): TreeItem {
        if (!this.isClusterNode(element)) {
            return element;
        }

        if (element instanceof TreeItem) {
            return element;
        }

        return ClusterListDataProvider.clusterNodeToTreeItem(element);
    }

    private isClusterNode(element: Cluster | TreeItem): element is Cluster {
        return (element as Cluster).state !== undefined;
    }

    getChildren(
        element?: Cluster | TreeItem | undefined
    ): ProviderResult<Array<Cluster | TreeItem>> {
        if (element) {
            if (this.isClusterNode(element)) {
                return ClusterListDataProvider.clusterNodeToTreeItems(element);
            } else {
                return [];
            }
        } else {
            return this.model.roots;
        }
    }

    public static clusterNodeToTreeItem(element: Cluster): TreeItem {
        let icon: ThemeIcon;
        switch (element.state) {
            case "RUNNING":
                icon = new ThemeIcon("debug-start");
                break;

            case "RESTARTING":
            case "PENDING":
            case "RESIZING":
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

        return {
            label: element.name,
            iconPath: icon,
            id: element.id,
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
    }

    /**
     * Creates a list of TreeItems from a list of clusters. The information
     * in the TreeItems match the information presented in cluster list
     * of the Databricks webapp.
     */
    public static async clusterNodeToTreeItems(
        element: Cluster
    ): Promise<Array<TreeItem>> {
        const children: TreeItem[] = [
            {
                label: "Cluster ID:",
                description: element.id,
            },
            {
                label: "URL:",
                description: await element.url,
                contextValue: "databricks-link",
            },
        ];
        if (element.cores) {
            children.push({
                label: "Cores:",
                description: element.cores + "",
            });
        }
        if (element.memoryMb) {
            children.push({
                label: "Memory:",
                description: formatSize(element.memoryMb),
            });
        }
        children.push(
            {
                label: "Databricks Runtime:",
                description: element.dbrVersion.join("."),
            },
            {
                label: "State:",
                description: element.state,
            },
            {
                label: "Creator:",
                description: element.creator,
            }
        );

        if (element.stateMessage && element.state !== "RUNNING") {
            children.push({
                label: "State message:",
                description: element.stateMessage,
            });
        }

        function formatSize(sizeInMB: number): string {
            if (sizeInMB > 1024) {
                return Math.round(sizeInMB / 1024).toString() + " GB";
            } else {
                return `${sizeInMB} MB`;
            }
        }

        return children;
    }
}
