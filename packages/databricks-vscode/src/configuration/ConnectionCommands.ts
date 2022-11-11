import {Cluster, Repo} from "@databricks/databricks-sdk";
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
     * disconnect fomr Databricks and remove profile from project settings.
     *
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

            const quickPick = window.createQuickPick<WorkspaceItem>();

            quickPick.busy = true;
            quickPick.canSelectMany = false;
            const items: WorkspaceItem[] = [
                {
                    label: "Create New Repo",
                    detail: `Open Databricks in the browser and create a new repo under /Repo/${me}`,
                    alwaysShow: false,
                },
                {
                    label: "",
                    kind: QuickPickItemKind.Separator,
                },
            ];
            quickPick.items = items;

            quickPick.show();

            const repos = await Repo.list(apiClient, {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                path_prefix: `/Repos/${me}`,
            });

            quickPick.items = items.concat(
                ...repos!.map((r) => ({
                    label: r.path.split("/").pop() || "",
                    detail: r.path,
                    path: r.path,
                    id: r.id,
                }))
            );
            quickPick.busy = false;

            await new Promise<void>((resolve) => {
                quickPick.onDidAccept(async () => {
                    if (
                        quickPick.selectedItems[0].label === "Create New Repo"
                    ) {
                        await UrlUtils.openExternal(
                            `${
                                (
                                    await this.connectionManager.apiClient?.host
                                )?.href ?? ""
                            }#folder/${this.connectionManager.repoRootId ?? ""}`
                        );
                    } else {
                        const repoPath = quickPick.selectedItems[0].path;
                        await this.connectionManager.attachSyncDestination(
                            Uri.from({
                                scheme: "wsfs",
                                path: repoPath,
                            })
                        );
                        quickPick.dispose();
                        resolve();
                    }
                });

                quickPick.onDidHide(() => {
                    quickPick.dispose();
                    resolve();
                });
            });
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
