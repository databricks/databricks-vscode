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
    describePausedTarget,
    PausedTarget,
} from "../../bundle/RemoteTargetHostManager";

const TREE_ICON_ID = "TARGET";

function getTreeIconId(key: string) {
    return `${TREE_ICON_ID}.${key}`;
}

/**
 * The subset of {@link RemoteTargetHostManager} this component reads to render
 * the persistent "paused" badge on the Target node (remote mode only).
 */
export interface PausedTargetProvider {
    readonly paused: PausedTarget | undefined;
    readonly onDidChangePaused: Event<void>;
}

export class BundleTargetComponent extends BaseComponent {
    constructor(
        private readonly configModel: ConfigModel,
        // Present only in remote mode, where a target's bundle commands can be
        // paused because the session isn't authenticated against its workspace.
        private readonly pausedTargetProvider?: PausedTargetProvider
    ) {
        super();
        this.disposables.push(
            this.configModel.onDidChangeTarget(() => {
                this.onDidChangeEmitter.fire();
            })
        );
        if (this.pausedTargetProvider !== undefined) {
            this.disposables.push(
                this.pausedTargetProvider.onDidChangePaused(() => {
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

        // Remote mode only: a persistent badge when the guard pauses the
        // target's bundle commands. Checked before the host read below, since an
        // unresolved target (e.g. a profile or an unparseable host) has no host
        // to show and would otherwise fall through to "Invalid host". Clicking
        // the row picks another target.
        const paused = this.pausedTargetProvider?.paused;
        if (paused !== undefined) {
            const description =
                paused.targetHost !== undefined
                    ? `${target} — targets ${paused.targetHost}, paused`
                    : `${target} — paused`;
            return [
                {
                    label: LabelUtils.highlightedLabel("Target"),
                    id: TREE_ICON_ID,
                    iconPath: new ThemeIcon(
                        "target",
                        new ThemeColor("problemsWarningIcon.foreground")
                    ),
                    description,
                    // "Copy Target" copies the name, not the description.
                    copyText: target,
                    tooltip: describePausedTarget(paused),
                    contextValue:
                        "databricks.configuration.target.hostMismatch",
                    collapsibleState: TreeItemCollapsibleState.Collapsed,
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
