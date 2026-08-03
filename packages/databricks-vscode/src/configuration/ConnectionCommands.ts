import {Cluster} from "../sdk-extensions";
import {
    Disposable,
    QuickPickItem,
    QuickPickItemKind,
    ThemeIcon,
    window,
    commands,
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
import {CliWrapper, ProcessError} from "../cli/CliWrapper";
import {
    AUTH_TYPE_SWITCH_ID,
    AUTH_TYPE_LOGIN_ID,
} from "../ui/configuration-view/AuthTypeComponent";
import {ManualLoginSource} from "../telemetry/constants";
import {onError} from "../utils/onErrorDecorator";
import {
    isPythonSetupEnabled,
    resolveServerlessVersion,
} from "../python-setup/utils/serverlessVersionResolver";
import {pickServerlessVersion} from "../python-setup/utils/serverlessVersionPicker";
import {collectBundleServerlessVersions} from "../python-setup/utils/bundleServerlessVersions";
import {collectProjectNotebookVersions} from "../python-setup/utils/projectNotebookVersions";
import {VersionObservation} from "../python-setup/utils/serverlessVersionScoring";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";

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
        private readonly cli: CliWrapper,
        private readonly workspaceFolderManager: WorkspaceFolderManager
    ) {}

    /**
     * Disconnect from Databricks and reset project settings.
     */
    async logoutCommand() {
        this.connectionManager.logout();
    }

    async configureLoginCommand(arg?: {id: string}) {
        commands.executeCommand("configurationView.focus");
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
        const provider = new PersonalAccessTokenAuthProvider(
            hostUrl,
            token,
            this.cli
        );
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
        return async (title?: string) => {
            const workspaceClient = this.connectionManager.workspaceClient;
            const me = this.connectionManager.databricksWorkspace?.userName;
            if (!workspaceClient || !me) {
                // TODO
                return;
            }

            const quickPick = window.createQuickPick<
                ClusterItem | QuickPickItem
            >();
            quickPick.title =
                typeof title === "string" ? title : "Select Cluster";
            quickPick.keepScrollPosition = true;
            quickPick.busy = true;
            quickPick.canSelectMany = false;
            const items: QuickPickItem[] = [
                {
                    label: "$(cloud) Serverless",
                    detail: `Run files as Workflows or use Databricks Connect without a dedicated cluster`,
                    alwaysShow: false,
                },
                {
                    label: "$(repo-create) Create New Cluster",
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
                } else if (selectedItem.label === "$(cloud) Serverless") {
                    // Dispose the compute QuickPick before opening the version
                    // sub-picker so they don't stack visually.
                    disposables.forEach((d) => d.dispose());
                    await this.selectServerless();
                    return;
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
     * Enable serverless compute. When the uv-native python-setup feature is
     * opted into, first ask the user to confirm the serverless environment
     * version (ranked from the project's bundle) and persist it with the
     * selection, so setup need not re-prompt. If they dismiss the version
     * picker, no compute change is made. With the feature off this is the
     * plain, unchanged serverless enable.
     */
    private async selectServerless() {
        if (!isPythonSetupEnabled()) {
            await this.connectionManager.enableServerless();
            return;
        }
        const version = await this.pickServerlessVersion();
        if (version === undefined) {
            // User dismissed the version picker -- don't switch compute.
            return;
        }
        await this.connectionManager.enableServerless(version);
    }

    /**
     * Resolve the serverless environment version: gather the project's version
     * evidence, score it, and let the user confirm the best-ranked candidate.
     * Returns the confirmed bare version, or undefined if dismissed. Delegates
     * to {@link resolveServerlessVersion} so the collect->score->pick pipeline
     * lives in one place; this call site only supplies where the evidence comes
     * from (the bundle today) and how the user confirms it.
     */
    private async pickServerlessVersion(): Promise<string | undefined> {
        return resolveServerlessVersion({
            collectObservations: () => this.collectServerlessObservations(),
            pick: pickServerlessVersion,
        });
    }

    /**
     * Gather serverless-version evidence from the project's local sources
     * (bundle config + notebooks). Each source is collected independently and
     * guarded, so one failing source never blocks the other or compute
     * selection; the scorer merges and de-dupes across sources. (The
     * workspace-default API source is not yet available — see DECO-27782.)
     */
    private async collectServerlessObservations(): Promise<
        VersionObservation[]
    > {
        const [bundle, notebooks] = await Promise.all([
            (async () => {
                try {
                    const validateConfig =
                        await this.configModel.get("validateConfig");
                    return collectBundleServerlessVersions(validateConfig);
                } catch {
                    return [] as VersionObservation[];
                }
            })(),
            (async () => {
                try {
                    const projectRoot =
                        this.workspaceFolderManager.activeProjectUri.fsPath;
                    return await collectProjectNotebookVersions(projectRoot);
                } catch {
                    // No active project, or notebook scan failed -- contribute
                    // nothing rather than blocking compute selection.
                    return [] as VersionObservation[];
                }
            })(),
        ]);
        return [...bundle, ...notebooks];
    }

    /**
     * Set cluster to undefined and remove cluster ID from settings file
     */
    detachClusterCommand() {
        return async () => {
            await this.connectionManager.detachCluster();
        };
    }

    @onError({popup: {prefix: "Error selecting target."}})
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
        try {
            await this.configModel.setTarget(selectedTarget.label);
        } catch (e) {
            if (e instanceof ProcessError) {
                e.showErrorMessage("Error selecting target");
            }
            throw e;
        }
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
