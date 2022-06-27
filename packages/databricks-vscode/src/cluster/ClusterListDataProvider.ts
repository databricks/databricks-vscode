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
import {ClusterModel, ClusterNode} from "./ClusterModel";

/**
 * Data provider for the cluster tree view
 */
export class ClusterListDataProvider
    implements TreeDataProvider<ClusterNode | TreeItem>, Disposable
{
    private _onDidChangeTreeData: EventEmitter<
        ClusterNode | TreeItem | undefined | void
    > = new EventEmitter<ClusterNode | TreeItem | undefined | void>();
    readonly onDidChangeTreeData: Event<
        ClusterNode | TreeItem | undefined | void
    > = this._onDidChangeTreeData.event;

    private disposables: Array<Disposable>;

    constructor(private model: ClusterModel) {
        this.disposables = [
            model.onDidChange(() => {
                this._onDidChangeTreeData.fire();
            }),
            this.autoReload(5000),
        ];
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }

    getTreeItem(element: ClusterNode | TreeItem): TreeItem {
        if (!this.isClusterNode(element)) {
            return element;
        }

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
            case "TERMINATED":
            case "ERROR":
            case "UNKNOWN":
                icon = new ThemeIcon("debug-stop");
                break;
        }

        return {
            label: element.name,
            iconPath: icon,
            //description: `${formatSize(element.memoryMb)} MB | ${element.cores} Cores | ${element.sparkVersion}`,
            id: element.id,
            collapsibleState: TreeItemCollapsibleState.Collapsed,
            contextValue:
                element.state === "RUNNING"
                    ? "clusterRunning"
                    : "clusterStopped",
        };
    }

    private isClusterNode(
        element: ClusterNode | TreeItem
    ): element is ClusterNode {
        return (element as ClusterNode).state !== undefined;
    }

    private autoReload(refreshRateInMs: number): Disposable {
        let interval = setInterval(() => {
            this.model.refresh();
        }, refreshRateInMs);
        return {
            dispose() {
                clearInterval(interval);
            },
        };
    }

    getChildren(
        element?: ClusterNode | TreeItem | undefined
    ): ProviderResult<Array<ClusterNode | TreeItem>> {
        if (element) {
            if (this.isClusterNode(element)) {
                let children = [
                    {
                        label: "Cluster ID:",
                        description: element.id,
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
                        label: "Spark version:",
                        description: element.sparkVersion,
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

                if (element.stateMessage) {
                    children.push({
                        label: "State message:",
                        description: element.stateMessage,
                    });
                }

                return children;
            } else {
                return [];
            }
        } else {
            return (async () => {
                let roots = await this.model.roots;
                if (roots && roots.length === 0) {
                    return [new TreeItem("No clusters found")];
                } else {
                    return roots;
                }
            })();
        }

        function formatSize(sizeInMB: number): string {
            if (sizeInMB > 1024) {
                return Math.round(sizeInMB / 1024).toString() + " GB";
            } else {
                return `${sizeInMB} MB`;
            }
        }
    }
}
