import {ThemeColor, ThemeIcon, TreeItemCollapsibleState} from "vscode";
import {FeatureManager} from "../../feature-manager/FeatureManager";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {ConfigModel} from "../../configuration/models/ConfigModel";
import {
    buildPythonSetupEntry,
    PythonSetupEntry,
} from "./pythonSetupEntry";

const ENVIRONMENT_COMPONENT_ID = "ENVIRONMENT";
const PYTHON_SETUP_COMMAND = "databricks.environment.setupPythonEnv";
const getItemContext = (key: string, available: boolean) =>
    `databricks.environment.${key}.${available ? "success" : "error"}`;

export class EnvironmentComponent extends BaseComponent {
    constructor(
        private readonly featureManager: FeatureManager,
        private readonly connectionManager: ConnectionManager,
        private readonly configModel: ConfigModel,
        // Optional so the legacy construction (and tests) keep working; when
        // absent the component behaves exactly as before (checklist only).
        private readonly pythonSetup?: PythonSetupEntry
    ) {
        super();
        this.featureManager.onDidChangeState("environment.dependencies", () =>
            this.onDidChangeEmitter.fire()
        );
        // Refresh the view when the uv-native setup flips to ready, so the CTA
        // becomes a done status line without the user re-expanding the section.
        if (this.pythonSetup) {
            this.disposables.push(
                this.pythonSetup.onDidChangeState(() =>
                    this.onDidChangeEmitter.fire()
                )
            );
        }
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
        // The uv-native setup and the legacy pip checklist are mutually
        // exclusive: when the python-setup entry is visible (opted-in + a
        // clean uv/greenfield project), show only it and skip the checklist.
        const pythonSetup = this.pythonSetup;
        if (pythonSetup && (await pythonSetup.isVisible())) {
            return buildPythonSetupEntry(
                {ready: pythonSetup.ready},
                PYTHON_SETUP_COMMAND
            );
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
        return children;
    }
}
