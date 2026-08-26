import {
    ThemeColor,
    ThemeIcon,
    TreeItemCollapsibleState,
    workspace,
} from "vscode";
import {FeatureManager} from "../../feature-manager/FeatureManager";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {ConfigModel} from "../../configuration/models/ConfigModel";
import {buildPythonSetupEntry, PythonSetupEntry} from "./pythonSetupEntry";

const ENVIRONMENT_COMPONENT_ID = "ENVIRONMENT";
const PYTHON_SETUP_COMMAND = "databricks.environment.setupPythonEnv";
const PYTHON_SETUP_RERUN_COMMAND = "databricks.environment.rerunPythonEnv";
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
            // `databricks.python.environmentSetup` decides whether this section
            // shows the uv entry or the legacy checklist, and getRoot reads it
            // live — so a change must repaint the tree, or the stale row lingers
            // (and a manual-mode click on a leftover uv row silently no-ops)
            // until an unrelated event happens to refresh it.
            this.disposables.push(
                workspace.onDidChangeConfiguration((e) => {
                    if (
                        e.affectsConfiguration(
                            "databricks.python.environmentSetup"
                        )
                    ) {
                        this.onDidChangeEmitter.fire();
                    }
                })
            );
        }
    }

    public async getRoot(): Promise<ConfigurationTreeItem[]> {
        // With the uv-native setup, the group would hold a single child, so
        // promote that entry to the top level and drop the empty wrapper. The
        // legacy checklist keeps its "Python Environment" group, which nests
        // multiple step rows.
        const pythonSetup = this.pythonSetup;
        if (pythonSetup && (await pythonSetup.isVisible())) {
            return buildPythonSetupEntry(
                {
                    ready: pythonSetup.ready,
                    driftState: pythonSetup.driftState,
                },
                PYTHON_SETUP_COMMAND,
                PYTHON_SETUP_RERUN_COMMAND
            );
        }
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
        // Only the legacy checklist nests under the "Python Environment" group.
        // The uv-native entry (mutually exclusive with the checklist) is a
        // top-level row instead — see getRoot — so it never reaches here.
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
