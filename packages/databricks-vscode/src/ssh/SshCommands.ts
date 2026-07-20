import {
    Disposable,
    Event,
    EventEmitter,
    QuickPick,
    QuickPickItem,
    QuickPickItemKind,
    ThemeIcon,
    window,
} from "vscode";
import {WorkspaceClient} from "@databricks/sdk-experimental";
import {ClusterListDataProvider} from "../cluster/ClusterListDataProvider";
import {ClusterModel} from "../cluster/ClusterModel";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {
    ClusterItem,
    formatQuickPickClusterDetails,
} from "../configuration/ConnectionCommands";
import {CliWrapper} from "../cli/CliWrapper";
import {AuthProvider} from "../configuration/auth/AuthProvider";
import {LoginWizard} from "../configuration/LoginWizard";
import {Cluster} from "../sdk-extensions";
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

/**
 * Minimal cluster feed the compute picker needs. `ClusterModel` (connected
 * path) satisfies this directly; `StandaloneClusterSource` (start-screen path,
 * no workspace folder) implements the same shape from a bare WorkspaceClient.
 */
interface ClusterSource extends Disposable {
    readonly roots: Cluster[] | undefined;
    readonly onDidChange: Event<void>;
    refresh(): void;
}

/**
 * Fetches eligible clusters directly from a WorkspaceClient for the standalone
 * (no workspace folder) tunnel flow, where no `ClusterModel` exists.
 */
class StandaloneClusterSource implements ClusterSource {
    private _clusters: Cluster[] | undefined;
    private readonly onDidChangeEmitter = new EventEmitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    constructor(private readonly workspaceClient: WorkspaceClient) {}

    get roots(): Cluster[] | undefined {
        return this._clusters;
    }

    refresh() {
        void this.load();
    }

    private async load() {
        const clusters: Cluster[] = [];
        for await (const cluster of Cluster.list(
            this.workspaceClient.apiClient
        )) {
            clusters.push(cluster);
        }
        this._clusters = clusters;
        this.onDidChangeEmitter.fire();
    }

    dispose() {
        this.onDidChangeEmitter.dispose();
    }
}

/**
 * The auth + compute context needed to launch a tunnel, resolved either from an
 * already-connected workspace or from a standalone login on the start screen.
 */
interface TunnelContext {
    authProvider: AuthProvider;
    userName: string;
    clusterSource: ClusterSource;
    // Cluster sources we create ourselves (standalone) must be disposed after
    // the picker; the shared ClusterModel is owned by the extension and is not.
    ownsClusterSource: boolean;
}

export class SshCommands implements Disposable {
    private disposables: Disposable[] = [];

    /**
     * `connectionManager`/`clusterModel` are only available once a workspace
     * folder is open. When they are undefined (start screen) the command falls
     * back to a standalone login flow so the tunnel can be started from the
     * dedicated SSH Tunnel panel with no folder open.
     */
    constructor(
        private readonly cli: CliWrapper,
        private readonly connectionManager?: ConnectionManager,
        private readonly clusterModel?: ClusterModel
    ) {}

    @onError({popup: {prefix: "Error starting SSH tunnel."}})
    async startTunnelCommand() {
        const context = await this.resolveTunnelContext();
        if (context === undefined) {
            return;
        }
        try {
            const compute = await this.pickCompute(
                context.userName,
                context.clusterSource
            );
            if (compute === undefined) {
                return;
            }
            await this.launchSshTunnel(
                context.authProvider,
                context.userName,
                compute
            );
        } finally {
            if (context.ownsClusterSource) {
                context.clusterSource.dispose();
            }
        }
    }

    /**
     * Resolves the auth provider, user and cluster feed for the tunnel. Uses the
     * connected workspace when available (connecting first if needed), otherwise
     * runs a standalone login wizard so the tunnel works with no folder open.
     */
    private async resolveTunnelContext(): Promise<TunnelContext | undefined> {
        if (this.connectionManager && this.clusterModel) {
            if (this.connectionManager.state !== "CONNECTED") {
                await this.connectionManager.login(true);
            }
            const workspace = this.connectionManager.databricksWorkspace;
            if (!workspace || this.connectionManager.state !== "CONNECTED") {
                window.showErrorMessage(
                    "Please connect to a Databricks workspace before starting an SSH tunnel."
                );
                return undefined;
            }
            return {
                authProvider: workspace.authProvider,
                userName: workspace.userName,
                clusterSource: this.clusterModel,
                ownsClusterSource: false,
            };
        }

        const authProvider = await LoginWizard.run(this.cli);
        if (authProvider === undefined || !(await authProvider.check())) {
            return undefined;
        }
        const workspaceClient = await authProvider.getWorkspaceClient();
        const userName = (await workspaceClient.currentUser.me()).userName;
        if (!userName) {
            window.showErrorMessage(
                "Could not determine the current user for the SSH tunnel."
            );
            return undefined;
        }
        return {
            authProvider,
            userName,
            clusterSource: new StandaloneClusterSource(workspaceClient),
            ownsClusterSource: true,
        };
    }

    private pickCompute(
        me: string,
        clusterSource: ClusterSource
    ): Promise<Compute | undefined> {
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
                const clusters = (clusterSource.roots ?? []).filter((c) =>
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
                clusterSource.onDidChange(refreshItems),
                quickPick,
                {dispose: () => clearTimeout(spinnerTimeout)},
            ];

            // Paint whatever is already cached first (fast path on reopen), then
            // trigger a reload; fresh results stream in via onDidChange.
            refreshItems();
            clusterSource.refresh();
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
     * attached single-user cluster if any, otherwise serverless. Only the
     * connected path has a configured cluster/serverless preference.
     */
    private preselect(quickPick: QuickPick<ClusterItem | ServerlessItem>) {
        const currentCluster = this.connectionManager?.cluster;
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
        if (this.connectionManager?.serverless) {
            const serverlessItem = quickPick.items.find(
                (i) => i.label === SERVERLESS_LABEL
            );
            if (serverlessItem) {
                quickPick.activeItems = [serverlessItem];
            }
        }
    }

    private async launchSshTunnel(
        authProvider: AuthProvider,
        userName: string,
        compute: Compute
    ) {
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
