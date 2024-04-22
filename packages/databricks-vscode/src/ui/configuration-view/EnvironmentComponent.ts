import {ThemeColor, ThemeIcon, TreeItemCollapsibleState} from "vscode";
import {FeatureManager} from "../../feature-manager/FeatureManager";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {ConfigModel} from "../../configuration/models/ConfigModel";

const ENVIRONMENT_COMPONENT_ID = "ENVIRONMENT";
const getItemContext = (key: string, available: boolean) =>
    `databricks.environment.${key}.${available ? "success" : "error"}`;

export class EnvironmentComponent extends BaseComponent {
    constructor(
        private readonly featureManager: FeatureManager,
        private readonly connectionManager: ConnectionManager,
        private readonly configModel: ConfigModel
    ) {
        super();
        this.featureManager.onDidChangeState("environment.dependencies", () =>
            this.onDidChangeEmitter.fire()
        );
    }

    public async getRoot(): Promise<ConfigurationTreeItem[]> {
        const environmentState = await this.featureManager.isEnabled(
            "environment.dependencies"
        );
        return [
            {
                label: "Python Environment",
                id: ENVIRONMENT_COMPONENT_ID,
                iconPath: environmentState.available
                    ? new ThemeIcon(
                          "check",
                          new ThemeColor("debugIcon.startForeground")
                      )
                    : new ThemeIcon("info", new ThemeColor("errorForeground")),
                collapsibleState: environmentState.available
                    ? TreeItemCollapsibleState.Collapsed
                    : TreeItemCollapsibleState.Expanded,
            },
        ];
    }

    public async getChildren(
        parent?: ConfigurationTreeItem
    ): Promise<ConfigurationTreeItem[]> {
        if (
            this.connectionManager.state !== "CONNECTED" ||
            (await this.configModel.get("mode")) !== "development"
        ) {
            return [];
        }
        if (parent === undefined) {
            return this.getRoot();
        }
        if (parent.id !== ENVIRONMENT_COMPONENT_ID) {
            return [];
        }
        const environmentState = await this.featureManager.isEnabled(
            "environment.dependencies"
        );
        const children = [];
        for (const [id, step] of environmentState.steps) {
            if (!step.available) {
                children.push({
                    contextValue: getItemContext(id, false),
                    label: step.title,
                    tooltip: step.message,
                    iconPath: step.action
                        ? new ThemeIcon(
                              "run",
                              new ThemeColor("errorForeground")
                          )
                        : new ThemeIcon(
                              "info",
                              new ThemeColor("errorForeground")
                          ),
                    command: {
                        title: "Setup python environment",
                        command: "databricks.environment.setup",
                        arguments: [step.id],
                    },
                });
            } else if (step.available && step.title) {
                children.push({
                    contextValue: getItemContext(id, true),
                    label: step.title,
                    tooltip: step.message,
                    iconPath: new ThemeIcon("check"),
                });
            }
        }
        return children;
    }

    private async setupPythonEnvironment() {}
}
