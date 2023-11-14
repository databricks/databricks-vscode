import {ConfigModel} from "../ConfigModel";
import {ConnectionManager} from "../ConnectionManager";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {ThemeIcon, ThemeColor} from "vscode";
const TREE_ICON_ID = "AUTH-TYPE";

export class AuthTypeComponent extends BaseComponent {
    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly configModel: ConfigModel
    ) {
        super();
        this.disposables.push(
            this.connectionManager.onDidChangeState(() => {
                this.onDidChangeEmitter.fire();
            }),
            this.configModel.onDidChange("target", () => {
                this.onDidChangeEmitter.fire();
            })
        );
    }

    private async getRoot(): Promise<ConfigurationTreeItem[]> {
        const authProvider =
            this.connectionManager.databricksWorkspace?.authProvider;

        if (this.configModel.target === undefined) {
            return [];
        }

        if (authProvider === undefined) {
            const label = "Login to Databricks";
            return [
                {
                    label: {
                        label: label,
                        highlights: [[0, label.length]],
                    },
                    iconPath: new ThemeIcon(
                        "plug",
                        new ThemeColor("notificationsErrorIcon.foreground")
                    ),
                    contextValue: "databricks.configuration.authType.none",
                    id: TREE_ICON_ID,
                },
            ];
        }

        return [
            {
                label: "Auth Type",
                description: authProvider.describe(),
                contextValue: `databricks.configuration.authType.${authProvider.authType}`,
                id: TREE_ICON_ID,
            },
        ];
    }
    public async getChildren(
        parent?: ConfigurationTreeItem
    ): Promise<ConfigurationTreeItem[]> {
        if (parent === undefined) {
            return this.getRoot();
        }

        return [];
    }
}
