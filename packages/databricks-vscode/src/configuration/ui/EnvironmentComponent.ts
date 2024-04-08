import {ThemeColor, ThemeIcon, TreeItemCollapsibleState} from "vscode";
import {FeatureManager} from "../../feature-manager/FeatureManager";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";

const ENVIRONMENT_COMPONENT_ID = "ENVIRONMENT";
const getItemId = (key?: string) =>
    key ? `${ENVIRONMENT_COMPONENT_ID}.${key}` : ENVIRONMENT_COMPONENT_ID;

export class EnvironmentComponent extends BaseComponent {
    constructor(private readonly featureManager: FeatureManager) {
        super();
        this.featureManager.onDidChangeState("environment.dependencies", () =>
            this.onDidChangeEmitter.fire()
        );
    }

    public async getRoot(): Promise<ConfigurationTreeItem[]> {
        const environmentState = await this.featureManager.isEnabled(
            "environment.dependencies"
        );
        if (environmentState.avaliable) {
            return [];
        }
        return [
            {
                label: "Local Python Environment",
                id: ENVIRONMENT_COMPONENT_ID,
                iconPath: new ThemeIcon(
                    "info",
                    new ThemeColor("errorForeground")
                ),
                tooltip: environmentState.message || "",
                collapsibleState: TreeItemCollapsibleState.Expanded,
                command: environmentState.action
                    ? {
                          title: "Setup local python environment",
                          command: "databricks.environment.setup",
                      }
                    : undefined,
            },
        ];
    }

    public async getChildren(
        parent?: ConfigurationTreeItem
    ): Promise<ConfigurationTreeItem[]> {
        if (parent === undefined) {
            return this.getRoot();
        }
        if (parent.id !== ENVIRONMENT_COMPONENT_ID) {
            return [];
        }
        const environmentState = await this.featureManager.isEnabled(
            "environment.dependencies"
        );
        if (environmentState.avaliable) {
            return [];
        }
        return [
            {
                label:
                    environmentState.title ||
                    "Failed to setup local python environment",
                description: environmentState.message || "",
                tooltip: environmentState.message || "",
                id: getItemId("setup"),
                iconPath: new ThemeIcon(
                    "gear",
                    new ThemeColor("errorForeground")
                ),
                command: {
                    title: "Setup local python environment",
                    command: "databricks.environment.setup",
                },
            },
        ];
    }

    private async setupPythonEnvironment() {}
}
