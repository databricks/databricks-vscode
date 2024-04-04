import {ThemeColor, ThemeIcon, TreeItemCollapsibleState, window} from "vscode";
import {FeatureManager} from "../../feature-manager/FeatureManager";
import {BaseComponent} from "./BaseComponent";
import {ConfigurationTreeItem} from "./types";
import {MsPythonExtensionWrapper} from "../../language/MsPythonExtensionWrapper";

const ENVIRONMENT_COMPONENT_ID = "ENVIRONMENT";
const getItemId = (key?: string) =>
    key ? `${ENVIRONMENT_COMPONENT_ID}.${key}` : ENVIRONMENT_COMPONENT_ID;

export class EnvironmentComponent extends BaseComponent {
    constructor(
        private readonly pythonExtension: MsPythonExtensionWrapper,
        private readonly featureManager: FeatureManager
    ) {
        super();
        this.pythonExtension.onDidChangePythonExecutable(() =>
            this.onDidChangeEmitter.fire()
        );
        this.featureManager.onDidChangeState("debugging.dbconnect", () =>
            this.onDidChangeEmitter.fire()
        );
    }

    public async getRoot(): Promise<ConfigurationTreeItem[]> {
        const envState = await this.pythonExtension.pythonEnvironment;
        if (envState?.environment === undefined) {
            return [
                {
                    label: "Setup Python Environment",
                    id: getItemId("python-environment"),
                    iconPath: new ThemeIcon(
                        "settings-gear",
                        new ThemeColor("errorForeground")
                    ),
                    collapsibleState: TreeItemCollapsibleState.None,
                    command: {
                        title: "Call",
                        command: "databricks.call",
                        arguments: [
                            async () => {
                                await this.pythonExtension.createPythonEnvironment();
                            },
                        ],
                    },
                },
            ];
        }

        const dbconnectState = await this.featureManager.isEnabled(
            "debugging.dbconnect"
        );
        if (!dbconnectState.avaliable && !dbconnectState.isDisabledByFf) {
            return [
                {
                    label: "Install Databricks Connect",
                    id: getItemId("databricks-connect"),
                    iconPath: new ThemeIcon(
                        "settings-gear",
                        new ThemeColor("errorForeground")
                    ),
                    tooltip: dbconnectState.reason || "",
                    collapsibleState: TreeItemCollapsibleState.None,
                    command: {
                        title: "Call",
                        command: "databricks.call",
                        arguments: [
                            async () => {
                                const dbconnectState =
                                    await this.featureManager.isEnabled(
                                        "debugging.dbconnect",
                                        true
                                    );
                                if (!dbconnectState.avaliable) {
                                    if (dbconnectState.reason) {
                                        window.showErrorMessage(
                                            dbconnectState.reason
                                        );
                                    }
                                    await dbconnectState.action?.();
                                }
                            },
                        ],
                    },
                },
            ];
        }

        return [];
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
