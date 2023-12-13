import {Cluster} from "../sdk-extensions";
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
import {FileUtils, UrlUtils} from "../utils";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {WorkspaceFsCommands} from "../workspace-fs";
import path from "node:path";
import {ConfigModel} from "./ConfigModel";

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
        private readonly clusterModel: ClusterModel,
        private readonly configModel: ConfigModel
    ) {}

    /**
     * Disconnect from Databricks and reset project settings.
     */
    async logoutCommand() {
        this.connectionManager.logout();
    }

    async configureWorkspaceCommand() {
        await this.connectionManager.configureWorkspace();
    }

    openDatabricksConfigFileCommand() {
        return async () => {
            const homeDir = FileUtils.getHomedir();
            let filePath =
                workspaceConfigs.databrickscfgLocation ??
                process.env.DATABRICKS_CONFIG_FILE ??
                path.join(homeDir, ".databrickscfg");

            if (filePath.startsWith("~/")) {
                filePath = path.join(homeDir, filePath.slice(2));
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
            await this.connectionManager.attachCluster(cluster.id);
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
                    await this.connectionManager.attachCluster(cluster.id);
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

    async selectTarget() {
        const targets = await this.configModel.bundleConfigReaderWriter.targets;
        const currentTarget = this.configModel.target;
        if (targets === undefined) {
            return;
        }

        const selectedTarget = await window.showQuickPick(
            Object.keys(targets)
                .map((t) => {
                    return {
                        label: t,
                        description: targets[t].mode ?? "dev",
                        detail: targets[t].workspace?.host,
                    };
                })
                .sort((a) => (a.label === currentTarget ? -1 : 1)),
            {title: "Select bundle target"}
        );
        if (selectedTarget === undefined) {
            return;
        }
        this.configModel.setTarget(selectedTarget.label);
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
