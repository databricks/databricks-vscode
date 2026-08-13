import {Cluster} from "../sdk-extensions";
import {compute, logging} from "@databricks/sdk-experimental";
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
import {collectServerlessVersionObservations} from "../python-setup/utils/serverlessVersionObservations";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";

// eslint-disable-next-line @typescript-eslint/naming-convention
const {NamedLogger} = logging;

/**
 * A compute target the user picked in the compute QuickPick. Structurally the
 * `setup-local` compute shape, so python-setup can consume it directly without
 * this module depending on the python-setup layer. Serverless is only ever
 * returned version-complete (see {@link ConnectionCommands.selectServerless}).
 */
export type SelectedCompute =
    | {kind: "cluster"; clusterId: string}
    | {kind: "serverless"; version: string};

function formatQuickPickClusterSize(sizeInMB: number): string {
    if (sizeInMB > 1024) {
        return Math.round(sizeInMB / 1024).toString() + " GB";
    } else {
        return `${sizeInMB} MB`;
    }
}
// Formats a compute state for display in the picker. RUNNING/TERMINATED map to
// the softer "Active"/"Inactive" (matching the Workspace UI); other states are
// title-cased ("PENDING" -> "Pending") so they read less harshly.
export function formatClusterState(state: compute.State): string {
    switch (state) {
        case "RUNNING":
            return "Active";
        case "TERMINATED":
            return "Inactive";
        default:
            return state.charAt(0) + state.slice(1).toLowerCase();
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

    /**
     * The returned handler resolves once the picker has fully closed, to the
     * compute the user attached -- a cluster or a version-complete serverless
     * target -- or `undefined` when they dismissed it or picked "Create New
     * Cluster" (which only opens the browser). Callers that just open the picker
     * can ignore the result (they always have); returning the selection lets a
     * caller that needs the outcome (python-setup) use it directly instead of
     * re-reading the connection manager, whose cluster attach propagates
     * asynchronously and would race an immediate read.
     */
    attachClusterQuickPickCommand() {
        return async (title?: string): Promise<SelectedCompute | undefined> => {
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
                typeof title === "string" ? title : "Select Compute";
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

            // Resolve only once the picker's work is done: on accept, after the
            // attach/enable (or browser hand-off) it triggers; on a plain hide,
            // right away. `settled` guards both a repeated Enter (which would
            // otherwise run concurrent attaches) and the hide handler -- which
            // also fires when accept disposes the picker -- from resolving early,
            // before the accept branch's awaits have settled.
            return await new Promise<SelectedCompute | undefined>((resolve) => {
                let settled = false;
                quickPick.onDidAccept(async () => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    let selected: SelectedCompute | undefined;
                    try {
                        const selectedItem = quickPick.selectedItems[0];
                        if (selectedItem === undefined) {
                            // Accepted with nothing highlighted -- nothing to do.
                        } else if ("cluster" in selectedItem) {
                            const cluster = selectedItem.cluster;
                            await this.connectionManager.attachCluster(
                                cluster.id
                            );
                            selected = {kind: "cluster", clusterId: cluster.id};
                        } else if (
                            selectedItem.label === "$(cloud) Serverless"
                        ) {
                            // Dispose the compute QuickPick before opening the
                            // version sub-picker so they don't stack visually.
                            disposables.forEach((d) => d.dispose());
                            const version = await this.selectServerless();
                            if (version !== undefined) {
                                selected = {kind: "serverless", version};
                            }
                        } else {
                            await UrlUtils.openExternal(
                                `${
                                    (
                                        await this.connectionManager
                                            .workspaceClient?.apiClient?.host
                                    )?.href ?? ""
                                }#create/cluster`
                            );
                        }
                    } catch (e) {
                        // The attach/enable helpers surface their own failures
                        // (they are @onError-decorated); swallow here only so a
                        // throw can't become an unhandled rejection or leave the
                        // picker open. `selected` stays undefined.
                        NamedLogger.getOrCreate("Extension").error(
                            "Compute picker selection failed",
                            e
                        );
                    } finally {
                        disposables.forEach((d) => d.dispose());
                        resolve(selected);
                    }
                });

                quickPick.onDidHide(() => {
                    disposables.forEach((d) => d.dispose());
                    quickPick.dispose();
                    if (!settled) {
                        settled = true;
                        resolve(undefined);
                    }
                });
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
     *
     * Returns the confirmed version when serverless was enabled with one, or
     * `undefined` -- when the version picker was dismissed (no change made), or
     * when the feature is off (serverless is enabled, but version-less). Only
     * the feature-on, version-complete case is a compute the caller can set up.
     */
    private async selectServerless(): Promise<string | undefined> {
        if (!isPythonSetupEnabled()) {
            await this.connectionManager.enableServerless();
            return undefined;
        }
        const version = await this.pickServerlessVersion();
        if (version === undefined) {
            // User dismissed the version picker -- don't switch compute.
            return undefined;
        }
        await this.connectionManager.enableServerless(version);
        return version;
    }

    /**
     * Resolve the serverless environment version: gather the project's version
     * evidence, score it, and let the user confirm the best-ranked candidate.
     * Returns the confirmed bare version, or undefined if dismissed. Delegates
     * to {@link resolveServerlessVersion} so the collect->score->pick pipeline
     * lives in one place; this call site only supplies where the evidence comes
     * from and how the user confirms it.
     */
    private async pickServerlessVersion(): Promise<string | undefined> {
        return resolveServerlessVersion({
            collectObservations: () =>
                collectServerlessVersionObservations({
                    getValidateConfig: () =>
                        this.configModel.get("validateConfig"),
                    // activeProjectUri throws when no project is active; the
                    // collector's contract is string | undefined.
                    projectRoot: () => {
                        try {
                            return this.workspaceFolderManager.activeProjectUri
                                .fsPath;
                        } catch {
                            return undefined;
                        }
                    },
                }),
            pick: pickServerlessVersion,
        });
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
