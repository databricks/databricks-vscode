import {Cluster} from "../sdk-extensions";
import {
    Disposable,
    QuickPickItem,
    QuickPickItemKind,
    ThemeIcon,
    window,
} from "vscode";
import {ClusterListDataProvider} from "../cluster/ClusterListDataProvider";
import {ClusterModel} from "../cluster/ClusterModel";
import {ConnectionManager} from "./ConnectionManager";
import {UrlUtils} from "../utils";
import {WorkspaceFsCommands} from "../workspace-fs";
import {ConfigModel} from "./models/ConfigModel";
import {saveNewProfile} from "./LoginWizard";
import {PersonalAccessTokenAuthProvider} from "./auth/AuthProvider";
import {normalizeHost} from "../utils/urlUtils";
import {CliWrapper} from "../cli/CliWrapper";
import {AUTH_TYPE_SWITCH_ID, AUTH_TYPE_LOGIN_ID} from "./ui/AuthTypeComponent";
import {ManualLoginSource} from "../telemetry/constants";

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
        private readonly configModel: ConfigModel,
        private readonly cli: CliWrapper
    ) {}

    /**
     * Disconnect from Databricks and reset project settings.
     */
    async logoutCommand() {
        this.connectionManager.logout();
    }

    async configureLoginCommand(arg?: {id: string}) {
        let source: ManualLoginSource = "command";
        if (arg?.id === AUTH_TYPE_SWITCH_ID) {
            source = "authTypeSwitch";
        } else if (arg?.id === AUTH_TYPE_LOGIN_ID) {
            source = "authTypeLogin";
        }
        await window.withProgress(
            {
                location: {viewId: "configurationView"},
                title: "Configuring Databricks login",
            },
            async () => {
                await this.connectionManager.configureLogin(source);
            }
        );
    }

    // This command is not exposed to users.
    // We use it to test new profile flow in e2e tests.
    async saveNewProfileCommand(name: string) {
        const host = this.connectionManager.workspaceClient?.config.host;
        const token = this.connectionManager.workspaceClient?.config.token;
        if (!host || !token) {
            throw new Error("Must login first");
        }
        const hostUrl = normalizeHost(host);
        const provider = new PersonalAccessTokenAuthProvider(hostUrl, token);
        await saveNewProfile(name, provider, this.cli);
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
        const targets = await this.configModel.targets;
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
