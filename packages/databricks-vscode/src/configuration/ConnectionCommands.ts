import {Cluster, Repos} from "@databricks/databricks-sdk";
import {homedir} from "node:os";
import {QuickPickItem, ThemeIcon, Uri, window, workspace} from "vscode";
import {ClusterListDataProvider} from "../cluster/ClusterListDataProvider";
import {MultiStepInput} from "../ui/wizard";
import {ConnectionManager} from "./ConnectionManager";

export interface WorkspaceItem extends QuickPickItem {
    id: number;
    path: string;
}

export interface ClusterItem extends QuickPickItem {
    cluster: Cluster;
}

export class ConnectionCommands {
    constructor(private connectionManager: ConnectionManager) {}
    /**
     * Try logging in with previously selected profile. If login fails or no profile
     * exists then ask user to configure or select a profile. The selected profile
     * is stored in project settings.
     */
    loginCommand() {
        return () => {
            this.connectionManager.login(true);
        };
    }

    /**
     * disconnect fomr Databricks and remove profile from project settings.
     *
     */
    logoutCommand() {
        return () => {
            this.connectionManager.logout();
        };
    }

    configureProjectCommand() {
        return () => {
            this.connectionManager.configureProject();
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
            const me = this.connectionManager.me;
            if (!apiClient || !me) {
                // TODO
                return;
            }

            const quickPick = window.createQuickPick<ClusterItem>();

            quickPick.busy = true;
            quickPick.show();

            let clusters = await Cluster.list(apiClient);

            function formatSize(sizeInMB: number): string {
                if (sizeInMB > 1024) {
                    return Math.round(sizeInMB / 1024).toString() + " GB";
                } else {
                    return `${sizeInMB} MB`;
                }
            }

            function formatDetails(cluster: Cluster) {
                let details = [];
                if (cluster.memoryMb) {
                    details.push(formatSize(cluster.memoryMb));
                }

                if (cluster.cores) {
                    details.push(`${cluster.cores} Cores`);
                }

                details.push(cluster.sparkVersion);
                details.push(cluster.creator);

                return details.join(" | ");
            }

            quickPick.items = clusters.map((c) => {
                let treeItem = ClusterListDataProvider.clusterNodeToTreeItem(c);
                return {
                    label: `$(${
                        (treeItem.iconPath as ThemeIcon).id
                    }) ${c.name!} (${c.id})`,
                    detail: formatDetails(c),
                    cluster: c,
                };
            });
            quickPick.busy = false;

            quickPick.onDidAccept(async () => {
                const cluster = quickPick.selectedItems[0].cluster;
                await this.connectionManager.attachCluster(cluster);
                quickPick.dispose();
            });

            quickPick.onDidHide(() => quickPick.dispose());
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
            let protocol: "REPO" | "DBFS" = "DBFS",
                destination: string = "";

            await MultiStepInput.run((input) =>
                selectProtocol(input, this.connectionManager)
            );
            async function selectProtocol(
                input: MultiStepInput,
                connectionManager: ConnectionManager
            ) {
                interface RepoOrDbfsItem extends QuickPickItem {
                    choice: "REPO" | "DBFS";
                }
                const items: RepoOrDbfsItem[] = [
                    {
                        choice: "REPO",
                        label: "REPO",
                        detail: "Sync to a Repo in databricks workspace",
                    },
                    {
                        choice: "DBFS",
                        label: "DBFS",
                        detail: "Sync to a temporary location in databricks workspace",
                    },
                ];

                protocol =
                    (
                        await input.showQuickPick({
                            title: "Protocol",
                            step: 1,
                            totalSteps: 2,
                            items: items,
                            placeholder: "",
                            shouldResume: async () => {
                                return false;
                            },
                        })
                    ).label === "DBFS"
                        ? "DBFS"
                        : "REPO";

                return (input: MultiStepInput) =>
                    selectDestination(input, connectionManager);
            }

            async function selectDestination(
                input: MultiStepInput,
                connectionManager: ConnectionManager
            ) {
                const apiClient = connectionManager.apiClient;
                const me = connectionManager.me;
                if (!apiClient || !me) {
                    // TODO
                    return;
                }
                if (protocol === "REPO") {
                    const reposApi = new Repos(apiClient);

                    destination = (
                        await input.showQuickPick({
                            title: "Sync Destination",
                            step: 2,
                            totalSteps: 4,
                            items: async () => {
                                let repos = (
                                    await reposApi.getRepos({
                                        // eslint-disable-next-line @typescript-eslint/naming-convention
                                        path_prefix: `/Repos/${me}`,
                                    })
                                ).repos;
                                return repos!.map((r) => ({
                                    label: r.path!.split("/").pop() || "",
                                    detail: r.path!,
                                    path: r.path!,
                                    id: r.id!,
                                }));
                            },
                            placeholder: "",
                            shouldResume: async () => {
                                return false;
                            },
                        })
                    ).detail!;
                } else {
                    destination = await input.showInputBox({
                        title: "Sync Destination",
                        step: 2,
                        totalSteps: 2,
                        prompt: "Path to destination",
                        value: `/tmp/${me}/${workspace.rootPath
                            ?.split("/")
                            .pop()}`,
                        shouldResume: async () => {
                            return false;
                        },
                        validate: async (value) => {
                            return undefined;
                        },
                    });
                }
            }

            this.connectionManager.attachSyncDestination(
                Uri.from({
                    scheme: protocol === "DBFS" ? "dbfs" : "dbws",
                    path: destination,
                })
            );
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
}
