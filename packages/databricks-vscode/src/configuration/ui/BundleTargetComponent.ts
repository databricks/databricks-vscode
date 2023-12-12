import {ThemeIcon, ThemeColor, TreeItemCollapsibleState, window} from "vscode";
import {ConfigModel} from "../ConfigModel";
import {BaseComponent} from "./BaseComponent";
import {DatabricksConfig} from "../types";
import {ConfigurationTreeItem} from "./types";

const TREE_ICON_ID = "TARGET";

function getTreeIconId(key: string) {
    return `${TREE_ICON_ID}.${key}`;
}

function humaniseMode(mode: DatabricksConfig["mode"]) {
    switch (mode) {
        case "prod":
            return "Production";
        case "staging":
            return "Staging";
        case "dev":
            return "Development";
        default:
            return mode;
    }
}

export class BundleTargetComponent extends BaseComponent {
    constructor(private readonly configModel: ConfigModel) {
        super();
        this.disposables.push(
            this.configModel.onDidChange("target", () => {
                this.onDidChangeEmitter.fire();
            })
        );
    }

    private async getRoot(): Promise<ConfigurationTreeItem[]> {
        const target = this.configModel.target;
        if (target === undefined) {
            const label = "Select a bundle target";
            return [
                {
                    label: {
                        label,
                        highlights: [[0, label.length]],
                    },
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

        const humanisedMode = humaniseMode(await this.configModel.get("mode"));
        if (humanisedMode === undefined) {
            window.showErrorMessage(
                `Could not find "mode" for target ${target}`
            );
            return [];
        }

        return [
            {
                label: target,
                id: TREE_ICON_ID,
                iconPath: new ThemeIcon(
                    "target",
                    new ThemeColor("debugIcon.startForeground")
                ),
                description: humanisedMode,
                contextValue: `databricks.configuration.target.${humanisedMode.toLocaleLowerCase()}}`,
                collapsibleState: TreeItemCollapsibleState.Collapsed,
            },
        ];
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
                description: host,
                collapsibleState: TreeItemCollapsibleState.None,
                url: host,
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
