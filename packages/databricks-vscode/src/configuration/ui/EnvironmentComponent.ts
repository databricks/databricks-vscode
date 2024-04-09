import {ThemeColor, ThemeIcon, TreeItemCollapsibleState} from "vscode";
import {FeatureManager} from "../../feature-manager/FeatureManager";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {ConnectionManager} from "../ConnectionManager";
import {ConfigModel} from "../models/ConfigModel";
import {child} from "winston";

const ENVIRONMENT_COMPONENT_ID = "ENVIRONMENT";
const getItemId = (key?: string) =>
    key ? `${ENVIRONMENT_COMPONENT_ID}.${key}` : ENVIRONMENT_COMPONENT_ID;

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
        if (environmentState.available) {
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
                collapsibleState: TreeItemCollapsibleState.Expanded,
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
        if (environmentState.available) {
            return [];
        }
        const children = [];
        for (const [id, step] of environmentState.steps) {
            if (!step.available) {
                children.push({
                    id: getItemId(id),
                    label: step.title,
                    description: step.message,
                    tooltip: step.message,
                    iconPath: new ThemeIcon(
                        "info",
                        new ThemeColor("errorForeground")
                    ),
                    command: {
                        title: "call",
                        command: "databricks.call",
                        arguments: [async () => step.action?.()],
                    },
                });
            }
        }
        return children;
    }

    private async setupPythonEnvironment() {}
}
