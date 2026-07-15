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

type Compute =
    | {type: "serverless"; accelerator?: string}
    | {type: "cluster"; clusterId: string};

/**
 * A serverless QuickPick item, optionally carrying a GPU accelerator type
 * forwarded to `databricks ssh connect --accelerator`. Plain serverless has no
 * accelerator.
 */
interface ServerlessItem extends QuickPickItem {
    accelerator?: string;
}

// Serverless compute options shown at the top of the picker: plain serverless
// plus the serverless GPU accelerator types supported by the CLI.
const SERVERLESS_ITEMS: ServerlessItem[] = [
    {
        label: SERVERLESS_LABEL,
        alwaysShow: true,
    },
    {
        label: "$(cloud) Serverless GPU 1xA10",
        alwaysShow: true,
        accelerator: "GPU_1xA10",
    },
    {
        label: "$(cloud) Serverless GPU 8xH100",
        alwaysShow: true,
        accelerator: "GPU_8xH100",
    },
];

export class SshCommands implements Disposable {
    private disposables: Disposable[] = [];

    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly clusterModel: ClusterModel,
        private readonly cli: CliWrapper
    ) {}

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

        const compute = await this.pickCompute(me);
        if (compute === undefined) {
            return;
        }
        await this.launchSshTunnel(compute);
    }

    private pickCompute(me: string): Promise<Compute | undefined> {
        return new Promise((resolve) => {
            const quickPick = window.createQuickPick<
                ClusterItem | ServerlessItem
            >();
            quickPick.title = "Select compute for SSH tunnel";
            quickPick.keepScrollPosition = true;
            quickPick.busy = true;
            quickPick.canSelectMany = false;

            const staticItems: ServerlessItem[] = [
                ...SERVERLESS_ITEMS,
                {
                    label: "",
                    kind: QuickPickItemKind.Separator,
                },
            ];
            quickPick.items = staticItems;

            const refreshItems = () => {
                // Only dedicated single-user clusters owned by the current user
                // can be used for an SSH tunnel.
                const clusters = (this.clusterModel.roots ?? []).filter((c) =>
                    c.isValidSingleUser(me)
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
                // Clear the spinner only once clusters have actually loaded.
                // On a cold first open the loader is still fetching, so we keep
                // spinning and let onDidChange repaint when clusters arrive.
                if (clusters.length > 0) {
                    quickPick.busy = false;
                }
                this.preselect(quickPick);
            };

            // Fallback so the spinner can't hang forever for a user with no
            // eligible clusters (onDidChange may never add any).
            const spinnerTimeout = setTimeout(() => {
                quickPick.busy = false;
            }, 10_000);

            // Register the change listener before triggering refresh() so no
            // onDidChange fired by the (re)started loader can be missed.
            const disposables: Disposable[] = [
                this.clusterModel.onDidChange(refreshItems),
                quickPick,
                {dispose: () => clearTimeout(spinnerTimeout)},
            ];

            // Paint whatever is already cached first (fast path on reopen), then
            // trigger a reload; fresh results stream in via onDidChange.
            refreshItems();
            this.clusterModel.refresh();
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
                    resolve({
                        type: "serverless",
                        accelerator: selectedItem.accelerator,
                    });
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
    private preselect(quickPick: QuickPick<ClusterItem | ServerlessItem>) {
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
