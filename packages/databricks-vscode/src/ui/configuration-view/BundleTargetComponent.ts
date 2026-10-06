import {
    Event,
    ThemeIcon,
    ThemeColor,
    TreeItemCollapsibleState,
    window,
} from "vscode";
import {ConfigModel} from "../../configuration/models/ConfigModel";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {UrlError} from "../../utils/urlUtils";
import {LabelUtils} from "../utils";
import {humaniseMode} from "../utils/BundleUtils";
import {
    describeHostMismatch,
    HostMismatch,
} from "../../bundle/RemoteTargetHostManager";

const TREE_ICON_ID = "TARGET";

function getTreeIconId(key: string) {
    return `${TREE_ICON_ID}.${key}`;
}

/**
 * The subset of {@link RemoteTargetHostManager} this component reads to render
 * the persistent host-mismatch badge on the Target node (remote mode only).
 */
export interface HostMismatchProvider {
    readonly mismatch: HostMismatch | undefined;
    readonly onDidChangeMismatch: Event<void>;
}

export class BundleTargetComponent extends BaseComponent {
    constructor(
        private readonly configModel: ConfigModel,
        // Present only in remote mode, where a target can point at a workspace
        // other than the one the session is authenticated against.
        private readonly hostMismatchProvider?: HostMismatchProvider
    ) {
        super();
        this.disposables.push(
            this.configModel.onDidChangeTarget(() => {
                this.onDidChangeEmitter.fire();
            })
        );
        if (this.hostMismatchProvider !== undefined) {
            this.disposables.push(
                this.hostMismatchProvider.onDidChangeMismatch(() => {
                    this.onDidChangeEmitter.fire();
                })
            );
        }
    }

    private async getRoot(): Promise<ConfigurationTreeItem[]> {
        const target = this.configModel.target;
        if (target === undefined) {
            return [
                {
                    label: LabelUtils.highlightedLabel(
                        "Select a bundle target"
                    ),
                    id: TREE_ICON_ID,
                    iconPath: new ThemeIcon(
                        "plug",
                        new ThemeColor("notificationsErrorIcon.foreground")
                    ),
                    contextValue: "databricks.configuration.target.none",
                    collapsibleState: TreeItemCollapsibleState.None,
                    command: {
                        title: "Select a bundle target",
                        command: "databricks.connection.bundle.selectTarget",
                    },
                },
            ];
        }

        try {
            if ((await this.configModel.get("host")) === undefined) {
                throw new UrlError("Host not found");
            }

            // Remote mode only: a persistent badge for the host mismatch. The
            // target's credentials are paused; clicking the row picks another.
            const mismatch = this.hostMismatchProvider?.mismatch;
            if (mismatch !== undefined) {
                return [
                    {
                        label: LabelUtils.highlightedLabel("Target"),
                        id: TREE_ICON_ID,
                        iconPath: new ThemeIcon(
                            "target",
                            new ThemeColor("problemsWarningIcon.foreground")
                        ),
                        description: `${target} — targets ${mismatch.targetHost}, paused`,
                        // "Copy Target" copies the name, not the description.
                        copyText: target,
                        tooltip: describeHostMismatch(mismatch),
                        contextValue:
                            "databricks.configuration.target.hostMismatch",
                        collapsibleState: TreeItemCollapsibleState.Collapsed,
                        command: {
                            title: "Select a bundle target",
                            command:
                                "databricks.connection.bundle.selectTarget",
                        },
                    },
                ];
            }

            const humanisedMode = humaniseMode(
                await this.configModel.get("mode")
            );
            if (humanisedMode === undefined) {
                window.showErrorMessage(
                    `Could not find "mode" for target ${target}`
                );
                return [];
            }

            return [
                {
                    label: "Target",
                    id: TREE_ICON_ID,
                    iconPath: new ThemeIcon(
                        "target",
                        new ThemeColor("debugIcon.startForeground")
                    ),
                    description: target,
                    contextValue: `databricks.configuration.target.${humanisedMode.toLocaleLowerCase()}}`,
                    collapsibleState: TreeItemCollapsibleState.Collapsed,
                },
            ];
        } catch (e) {
            if (e instanceof UrlError) {
                return [
                    {
                        label: LabelUtils.highlightedLabel(
                            `Invalid host for target ${target}`
                        ),
                        id: TREE_ICON_ID,
                        iconPath: new ThemeIcon(
                            "target",
                            new ThemeColor("debugIcon.startForeground")
                        ),
                        contextValue: `databricks.configuration.target.error`,
                        collapsibleState: TreeItemCollapsibleState.None,
                        command: {
                            title: "Select a bundle target",
                            command:
                                "databricks.connection.bundle.selectTarget",
                        },
                    },
                ];
            }

            throw e;
        }
    }

    public async getChildren(
        parent?: ConfigurationTreeItem
    ): Promise<ConfigurationTreeItem[]> {
        if (parent === undefined) {
            return this.getRoot();
        }

        if (parent.id !== TREE_ICON_ID) {
            return [];
        }

        const host = await this.configModel.get("host");

        return [
            {
                label: "Host",
                id: getTreeIconId("host"),
                description: host?.toString(),
                collapsibleState: TreeItemCollapsibleState.None,
                url: host?.toString(),
            },
            {
                label: "Mode",
                id: getTreeIconId("mode"),
                description: humaniseMode(await this.configModel.get("mode")),
                collapsibleState: TreeItemCollapsibleState.None,
            },
        ];
    }
}
