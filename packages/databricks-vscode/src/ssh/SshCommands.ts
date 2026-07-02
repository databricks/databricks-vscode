import {
    Disposable,
    QuickPick,
    QuickPickItem,
    QuickPickItemKind,
    ThemeIcon,
    window,
} from "vscode";
import {ClusterListDataProvider} from "../cluster/ClusterListDataProvider";
import {ClusterModel} from "../cluster/ClusterModel";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {
    ClusterItem,
    formatQuickPickClusterDetails,
} from "../configuration/ConnectionCommands";
import {CliWrapper} from "../cli/CliWrapper";
import {onError} from "../utils/onErrorDecorator";

const SERVERLESS_LABEL = "$(cloud) Serverless";

type Compute = {type: "serverless"} | {type: "cluster"; clusterId: string};

export class SshCommands implements Disposable {
    private disposables: Disposable[] = [];

    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly clusterModel: ClusterModel,
        private readonly cli: CliWrapper
    ) {}

    /**
     * Shows a compute picker (single-user clusters + serverless), then launches
     * `databricks ssh connect --ide=vscode` in a terminal to open a remote
     * VS Code window.
     */
    @onError({popup: {prefix: "Error starting SSH tunnel."}})
    async startTunnelCommand() {
        const workspaceClient = this.connectionManager.workspaceClient;
        const me = this.connectionManager.databricksWorkspace?.userName;
        if (!workspaceClient || !me) {
            window.showErrorMessage(
                "Please connect to a Databricks workspace before starting an SSH tunnel."
            );
            return;
        }

        const compute = await this.pickCompute();
        if (compute === undefined) {
            return;
        }
        await this.launchSshTunnel(compute);
    }

    private pickCompute(): Promise<Compute | undefined> {
        return new Promise((resolve) => {
            const quickPick = window.createQuickPick<
                ClusterItem | QuickPickItem
            >();
            quickPick.title = "Select compute for SSH tunnel";
            quickPick.keepScrollPosition = true;
            quickPick.busy = true;
            quickPick.canSelectMany = false;

            const staticItems: QuickPickItem[] = [
                {
                    label: SERVERLESS_LABEL,
                    detail: "Connect to serverless compute (no dedicated cluster)",
                    alwaysShow: true,
                },
                {
                    label: "",
                    kind: QuickPickItemKind.Separator,
                },
            ];
            quickPick.items = staticItems;

            this.clusterModel.refresh();
            const refreshItems = () => {
                // Only dedicated single-user access-mode clusters can be used
                // for an SSH tunnel.
                const clusters = (this.clusterModel.roots ?? []).filter((c) =>
                    c.isSingleUser()
                );
                quickPick.items = staticItems.concat(
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
                this.preselect(quickPick);
            };

            const disposables = [
                this.clusterModel.onDidChange(refreshItems),
                quickPick,
            ];

            refreshItems();
            quickPick.busy = false;
            quickPick.show();

            quickPick.onDidAccept(() => {
                const selectedItem = quickPick.selectedItems[0];
                disposables.forEach((d) => d.dispose());
                if (selectedItem === undefined) {
                    resolve(undefined);
                } else if ("cluster" in selectedItem) {
                    resolve({
                        type: "cluster",
                        clusterId: selectedItem.cluster.id,
                    });
                } else {
                    resolve({type: "serverless"});
                }
            });

            quickPick.onDidHide(() => {
                disposables.forEach((d) => d.dispose());
               // resolve(undefined);
            });
        });
    }

    /**
     * Pre-selects the compute the user already has configured locally: the
     * attached single-user cluster if any, otherwise serverless.
     */
    private preselect(quickPick: QuickPick<ClusterItem | QuickPickItem>) {
        const currentCluster = this.connectionManager.cluster;
        if (currentCluster?.isSingleUser()) {
            const match = quickPick.items.find(
                (i): i is ClusterItem =>
                    "cluster" in i && i.cluster.id === currentCluster.id
            );
            if (match) {
                quickPick.activeItems = [match];
                return;
            }
        }
        if (this.connectionManager.serverless) {
            const serverlessItem = quickPick.items.find(
                (i) => i.label === SERVERLESS_LABEL
            );
            if (serverlessItem) {
                quickPick.activeItems = [serverlessItem];
            }
        }
    }

    private async launchSshTunnel(compute: Compute) {
        const authProvider =
            this.connectionManager.databricksWorkspace?.authProvider;
        const userName = this.connectionManager.databricksWorkspace?.userName;
        if (!authProvider || !userName) {
            window.showErrorMessage(
                "Please connect to a Databricks workspace before starting an SSH tunnel."
            );
            return;
        }

        const {args} = this.cli.getSshConnectCommand({compute});

        const env: Record<string, string> = {
            ...this.cli.getSshConnectEnvVars(authProvider),
            // The remote window opens at the user's home folder. Forward the
            // file the user is currently editing so the remote extension can
            // auto-open it (see the remote-mode branch in extension.ts). The
            // CLI has no folder/file flag, so we pass it out of band.
            /* eslint-disable @typescript-eslint/naming-convention */
            DATABRICKS_REMOTE_HOME_FOLDER: `/Users/${userName}`,
            /* eslint-enable @typescript-eslint/naming-convention */
        };
        const activeFile = window.activeTextEditor?.document.uri.fsPath;
        if (activeFile) {
            env["DATABRICKS_REMOTE_OPEN_FILE"] = activeFile;
        }

        const terminal = window.createTerminal({
            name: "Databricks SSH Tunnel",
            isTransient: true,
            env,
            strictEnv: false,
        });
        this.disposables.push(terminal);
        terminal.show();
        terminal.sendText(`${this.cli.escapedCliPath} ${args.join(" ")}`);
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
