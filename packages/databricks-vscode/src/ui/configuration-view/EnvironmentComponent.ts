import {ThemeColor, ThemeIcon, TreeItemCollapsibleState} from "vscode";
import {FeatureManager} from "../../feature-manager/FeatureManager";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {ConfigModel} from "../../configuration/models/ConfigModel";
import {VpexEnvironmentSetup} from "../../language/VpexEnvironmentSetup";

const ENVIRONMENT_COMPONENT_ID = "ENVIRONMENT";
const getItemContext = (key: string, available: boolean) =>
    `databricks.environment.${key}.${available ? "success" : "error"}`;

export class EnvironmentComponent extends BaseComponent {
    constructor(
        private readonly featureManager: FeatureManager,
        private readonly connectionManager: ConnectionManager,
        private readonly configModel: ConfigModel,
        private readonly vpexEnvironmentSetup: VpexEnvironmentSetup
    ) {
        super();
        this.featureManager.onDidChangeState("environment.dependencies", () =>
            this.onDidChangeEmitter.fire()
        );
        this.vpexEnvironmentSetup.onDidChangeState(() =>
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
                contextValue: getItemContext(
                    "root",
                    environmentState.available
                ),
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
        const children: ConfigurationTreeItem[] = [];
        for (const [id, step] of environmentState.steps) {
            if (!step.available && step.title) {
                children.push({
                    contextValue: getItemContext(id, false),
                    label: step.title,
                    tooltip: step.message,
                    iconPath: step.action
                        ? new ThemeIcon(
                              "run",
                              step.optional
                                  ? undefined
                                  : new ThemeColor("errorForeground")
                          )
                        : new ThemeIcon(
                              "info",
                              step.optional
                                  ? undefined
                                  : new ThemeColor("errorForeground")
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
                if (step.warning) {
                    children.push({
                        contextValue: getItemContext(id, true),
                        label: step.warning,
                        iconPath: new ThemeIcon("warning"),
                    });
                }
            }
        }

        // VPEX one-click setup entry: runs `databricks dbconnect init/sync`
        // and auto-adopts the resulting .venv.
        const vpexReady = this.vpexEnvironmentSetup.ready;
        children.push({
            contextValue: getItemContext("vpex", vpexReady),
            label: vpexReady
                ? "Databricks Connect (VPEX): serverless-v4 · py3.12"
                : "Set up Databricks Connect (VPEX)",
            tooltip: vpexReady
                ? "Environment ready: serverless-v4 (Python 3.12, databricks-connect 17.3). Click to re-run setup."
                : "One-click setup of the Databricks Connect Python environment.",
            iconPath: vpexReady
                ? new ThemeIcon("check")
                : new ThemeIcon("rocket"),
            command: {
                title: "Set up Python Environment (VPEX)",
                command: "databricks.environment.setupVpex",
            },
        });

        return children;
    }
}
