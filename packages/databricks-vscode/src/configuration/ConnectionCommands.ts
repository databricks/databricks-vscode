import {Cluster, WorkspaceFsEntity} from "@databricks/databricks-sdk";
import {homedir} from "node:os";
import {
    Disposable,
    FileSystemError,
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
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {WorkspaceFsCommands} from "../workspace-fs";
import path from "node:path";
import {RemoteUri, REPO_NAME_SUFFIX} from "../sync/SyncDestination";

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
        private wsfsCommands: WorkspaceFsCommands,
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
            let filePath =
                workspaceConfigs.databrickscfgLocation ??
                process.env.DATABRICKS_CONFIG_FILE ??
                path.join(homedir(), ".databrickscfg");

            if (filePath.startsWith("~/")) {
                filePath = path.join(homedir(), filePath.slice(2));
            }
            const uri = Uri.file(path.normalize(filePath));

            try {
                await workspace.fs.stat(uri);
            } catch (e) {
                if (e instanceof FileSystemError && e.code === "FileNotFound") {
                    await workspace.fs.writeFile(uri, Buffer.from(""));
                } else {
                    throw e;
                }
            }

            const doc = await workspace.openTextDocument(uri);
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
            const workspaceClient = this.connectionManager.workspaceClient;
            const me = this.connectionManager.databricksWorkspace?.userName;
            if (!workspaceClient || !me) {
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
                                await this.connectionManager.workspaceClient
                                    ?.apiClient?.host
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
            const wsClient = this.connectionManager.workspaceClient;
            const me = this.connectionManager.databricksWorkspace?.userName;
            const rootDirPath =
                this.connectionManager.databricksWorkspace?.currentFsRoot;
            if (!wsClient || !me || !rootDirPath) {
                // TODO
                return;
            }

            const rootDir = await WorkspaceFsEntity.fromPath(
                wsClient,
                rootDirPath.path
            );

            type WorkspaceFsQuickPickItem = QuickPickItem & {
                path?: string;
            };
            const children: WorkspaceFsQuickPickItem[] = [
                {
                    label: "Create New Sync Destination",
                    alwaysShow: true,
                    detail: workspaceConfigs.enableFilesInWorkspace
                        ? `Create a new folder under /Workspace/${me}/.ide as sync destination`
                        : `Create a new Repo under /Repos/${me} as sync destination`,
                },
                {
                    label: "Sync Destinations",
                    kind: QuickPickItemKind.Separator,
                },
            ];

            const input = window.createQuickPick();
            input.busy = true;
            input.show();
            input.items = children;
            if (workspaceConfigs.enableFilesInWorkspace) {
                children.push(
                    ...((await rootDir?.children) ?? [])
                        .filter((entity) =>
                            WorkspaceFsUtils.isDirectory(entity)
                        )
                        .map((entity) => {
                            return {
                                label: entity.basename,
                                detail: entity.path,
                                path: entity.path,
                            };
                        })
                );
            } else {
                const repos = (await rootDir?.children) ?? [];

                children.push(
                    ...repos
                        .filter((entity) => {
                            return entity.basename.endsWith(REPO_NAME_SUFFIX);
                        })
                        .map((entity) => {
                            return {
                                label: entity.basename.slice(
                                    0,
                                    -REPO_NAME_SUFFIX.length
                                ),
                                detail: entity.path,
                                path: entity.path,
                            };
                        })
                );
            }
            input.items = children;
            input.busy = false;

            const disposables = [
                input,
                input.onDidAccept(async () => {
                    const fn = async () => {
                        const selection = input
                            .selectedItems[0] as WorkspaceFsQuickPickItem;
                        if (
                            selection.label !== "Create New Sync Destination" &&
                            selection.path
                        ) {
                            this.connectionManager.attachSyncDestination(
                                new RemoteUri(selection.path)
                            );
                            return;
                        }
                        const created = await this.wsfsCommands.createFolder(
                            rootDir
                        );
                        if (created === undefined) {
                            return;
                        }
                        this.connectionManager.attachSyncDestination(
                            new RemoteUri(created.path)
                        );
                    };
                    try {
                        await fn();
                    } catch (e: unknown) {
                        if (e instanceof Error) {
                            window.showErrorMessage(
                                `Error while creating a new directory: ${e.message}`
                            );
                        }
                    } finally {
                        disposables.forEach((i) => i.dispose());
                    }
                }),
                input.onDidHide(() => {
                    disposables.forEach((i) => i.dispose());
                }),
            ];
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
