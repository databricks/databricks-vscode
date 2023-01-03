import {Cluster} from "@databricks/databricks-sdk";
import {homedir} from "node:os";
import {
    Disposable,
    QuickPickItem,
    QuickPickItemKind,
    ThemeIcon,
    Uri,
    window,
    workspace,
} from "vscode";
import {ClusterListDataProvider} from "../cluster/ClusterListDataProvider";
import {ClusterModel} from "../cluster/ClusterModel";
import {ConnectionManager} from "./ConnectionManager";
import {UrlUtils} from "../utils";
import {SyncDestination} from "./SyncDestination";

function formatQuickPickClusterSize(sizeInMB: number): string {
    if (sizeInMB > 1024) {
        return Math.round(sizeInMB / 1024).toString() + " GB";
    } else {
        return `${sizeInMB} MB`;
    }
}
export function formatQuickPickClusterDetails(cluster: Cluster) {
    const details = [];
    if (cluster.memoryMb) {
        details.push(formatQuickPickClusterSize(cluster.memoryMb));
    }

    if (cluster.cores) {
        details.push(`${cluster.cores} Cores`);
    }

    details.push(cluster.sparkVersion);
    details.push(cluster.creator);

    return details.join(" | ");
}

export interface WorkspaceItem extends QuickPickItem {
    id?: number;
    path?: string;
}

export interface ClusterItem extends QuickPickItem {
    cluster: Cluster;
}

export class ConnectionCommands implements Disposable {
    private disposables: Disposable[] = [];
    constructor(
        private connectionManager: ConnectionManager,
        private readonly clusterModel: ClusterModel
    ) {}

    /**
     * Disconnect from Databricks and reset project settings.
     */
    logoutCommand() {
        return () => {
            this.connectionManager.logout();
        };
    }

    configureWorkspaceCommand() {
        return () => {
            this.connectionManager.configureWorkspace();
        };
    }

    openDatabricksConfigFileCommand() {
        return async () => {
            const doc = await workspace.openTextDocument(
                Uri.joinPath(Uri.file(homedir()), ".databrickscfg")
            );
            await window.showTextDocument(doc);
        };
    }

    /**
     * Attach to cluster from settings. If attach fails or no cluster is configured
     * then show dialog to select (or create) a cluster. The selected cluster is saved
     * in settings.
     */
    attachClusterCommand() {
        return async (cluster: Cluster) => {
            await this.connectionManager.attachCluster(cluster);
        };
    }

    attachClusterQuickPickCommand() {
        return async () => {
            const apiClient = this.connectionManager.apiClient;
            const me = this.connectionManager.databricksWorkspace?.userName;
            if (!apiClient || !me) {
                // TODO
                return;
            }

            const quickPick = window.createQuickPick<
                ClusterItem | QuickPickItem
            >();
            quickPick.keepScrollPosition = true;
            quickPick.busy = true;

            quickPick.busy = true;
            quickPick.canSelectMany = false;
            const items: QuickPickItem[] = [
                {
                    label: "Create New Cluster",
                    detail: `Open Databricks in the browser and create a new cluster`,
                    alwaysShow: false,
                },
                {
                    label: "",
                    kind: QuickPickItemKind.Separator,
                },
            ];
            quickPick.items = items;

            this.clusterModel.refresh();
            const refreshQuickPickItems = () => {
                const clusters = this.clusterModel.roots ?? [];
                quickPick.items = items.concat(
                    clusters.map((c) => {
                        const treeItem =
                            ClusterListDataProvider.clusterNodeToTreeItem(c);
                        return {
                            label: `$(${
                                (treeItem.iconPath as ThemeIcon).id
                            }) ${c.name!} (${c.id})`,
                            detail: formatQuickPickClusterDetails(c),
                            cluster: c,
                        };
                    })
                );
            };

            const disposables = [
                this.clusterModel.onDidChange(refreshQuickPickItems),
                quickPick,
            ];

            refreshQuickPickItems();
            quickPick.show();

            quickPick.onDidAccept(async () => {
                const selectedItem = quickPick.selectedItems[0];
                if ("cluster" in selectedItem) {
                    const cluster = selectedItem.cluster;
                    await this.connectionManager.attachCluster(cluster);
                } else {
                    await UrlUtils.openExternal(
                        `${
                            (
                                await this.connectionManager.apiClient?.host
                            )?.href ?? ""
                        }#create/cluster`
                    );
                }
                disposables.forEach((d) => d.dispose());
            });

            quickPick.onDidHide(() => {
                disposables.forEach((d) => d.dispose());
                quickPick.dispose();
            });
        };
    }

    /**
     * Set cluster to undefined and remove cluster ID from settings file
     */
    detachClusterCommand() {
        return async () => {
            await this.connectionManager.detachCluster();
        };
    }

    attachSyncDestinationCommand() {
        return async () => {
            const apiClient = this.connectionManager.apiClient;
            const me = this.connectionManager.databricksWorkspace?.userName;
            if (!apiClient || !me) {
                // TODO
                return;
            }

            let input: string | undefined = `/Users/${me}`;
            while (true) {
                input = await window.showInputBox({
                    prompt: "Enter full sync destination path",
                    value: input,
                });
                if (input === undefined) {
                    return undefined;
                }

                const uri = Uri.from({scheme: "wsfs", path: input});
                if (
                    (await SyncDestination.getWorkspaceFsDir(
                        apiClient,
                        uri
                    )) === undefined
                ) {
                    const retry = await window.showErrorMessage(
                        `Invalid sync destination: ${input}`,
                        "Enter another path",
                        "Cancel"
                    );
                    if (retry === "Cancel") {
                        return undefined;
                    }
                    continue;
                }
                this.connectionManager.attachSyncDestination(uri);
                break;
            }
        };
    }

    /**
     * Set workspace to undefined and remove workspace path from settings file.
     */
    detachWorkspaceCommand() {
        return () => {
            this.connectionManager.detachSyncDestination();
        };
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
