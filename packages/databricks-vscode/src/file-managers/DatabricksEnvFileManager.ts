import {
    Disposable,
    Uri,
    workspace,
    ExtensionContext,
    StatusBarItem,
    window,
    StatusBarAlignment,
    ThemeColor,
    EventEmitter,
} from "vscode";
import {writeFile, readFile} from "fs/promises";
import {FeatureManager} from "../feature-manager/FeatureManager";
import {ConnectionManager} from "../configuration/ConnectionManager";
import os from "node:os";
import * as path from "node:path";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {SystemVariables} from "../vscode-objs/SystemVariables";
import {logging} from "@databricks/databricks-sdk";
import {Loggers} from "../logger";
import {Context, context} from "@databricks/databricks-sdk/dist/context";
import {MsPythonExtensionWrapper} from "../language/MsPythonExtensionWrapper";

export class DatabricksEnvFileManager implements Disposable {
    private disposables: Disposable[] = [];
    private readonly databricksEnvPath: Uri;
    private readonly userEnvPath: Uri;
    private readonly statusBarButton: StatusBarItem;
    private readonly onDidChangeEnvironmentVariablesEmitter =
        new EventEmitter<void>();
    public readonly onDidChangeEnvironmentVariables =
        this.onDidChangeEnvironmentVariablesEmitter.event;

    constructor(
        workspacePath: Uri,
        private readonly featureManager: FeatureManager,
        private readonly connectionManager: ConnectionManager,
        private readonly extensionContext: ExtensionContext,
        private readonly pythonExtension: MsPythonExtensionWrapper
    ) {
        const systemVariableResolver = new SystemVariables(workspacePath);
        const unresolvedDatabricksEnvFile = path.join(
            "${workspaceFolder}",
            ".databricks",
            ".databricks.env"
        );
        this.databricksEnvPath = Uri.file(
            systemVariableResolver.resolve(unresolvedDatabricksEnvFile)
        );

        const unresolvedUserEnvFile = workspaceConfigs.userEnvFile
            ? workspaceConfigs.userEnvFile
            : !workspaceConfigs.msPythonEnvFile ||
              workspaceConfigs.msPythonEnvFile.includes(
                  this.databricksEnvPath.fsPath
              )
            ? path.join("${workspaceFolder}", ".env")
            : workspaceConfigs.msPythonEnvFile;
        this.userEnvPath = Uri.file(
            systemVariableResolver.resolve(unresolvedUserEnvFile)
        );

        workspaceConfigs.msPythonEnvFile = unresolvedDatabricksEnvFile;
        workspaceConfigs.userEnvFile = unresolvedUserEnvFile;

        const userEnvFileWatcher = workspace.createFileSystemWatcher(
            this.userEnvPath.fsPath
        );

        this.statusBarButton = window.createStatusBarItem(
            StatusBarAlignment.Left,
            1000
        );
        this.disableStatusBarButton();

        this.disposables.push(
            this.statusBarButton,
            userEnvFileWatcher,
            userEnvFileWatcher.onDidChange(() => this.writeFile(), this),
            userEnvFileWatcher.onDidDelete(() => this.writeFile(), this),
            userEnvFileWatcher.onDidCreate(() => this.writeFile(), this),
            featureManager.onDidChangeState(
                "debugging.dbconnect",
                (featureState) => {
                    if (!featureState.avaliable) {
                        this.clearTerminalEnv();
                        this.disableStatusBarButton();
                        return;
                    }
                    this.writeFile();
                    this.emitToTerminal();
                },
                this
            ),
            this.connectionManager.onDidChangeCluster(async (cluster) => {
                if (
                    !cluster ||
                    this.connectionManager.state !== "CONNECTED" ||
                    !(
                        await this.featureManager.isEnabled(
                            "debugging.dbconnect"
                        )
                    ).avaliable
                ) {
                    this.clearTerminalEnv();
                    this.disableStatusBarButton();
                    return;
                }
                this.writeFile();
                this.emitToTerminal();
            }, this),
            this.connectionManager.onDidChangeState(async () => {
                if (
                    this.connectionManager.state !== "CONNECTED" ||
                    !(
                        await this.featureManager.isEnabled(
                            "debugging.dbconnect"
                        )
                    ).avaliable
                ) {
                    this.clearTerminalEnv();
                    this.disableStatusBarButton();
                    return;
                }
                this.writeFile();
                this.emitToTerminal();
            }, this)
        );
    }

    private async disableStatusBarButton() {
        const featureState = await this.featureManager.isEnabled(
            "debugging.dbconnect"
        );
        if (featureState.isDisabledByFf) {
            return;
        }
        this.statusBarButton.name = "DB Connect V2 Disabled";
        this.statusBarButton.text = "DB Connect V2 Disabled";
        this.statusBarButton.backgroundColor = new ThemeColor(
            "statusBarItem.errorBackground"
        );
        this.statusBarButton.tooltip = featureState?.reason;
        this.statusBarButton.command = {
            title: "Call",
            command: "databricks.call",
            arguments: [
                async () => {
                    const featureState = await this.featureManager.isEnabled(
                        "debugging.dbconnect",
                        true
                    );
                    if (!featureState.avaliable) {
                        if (featureState.action) {
                            featureState.action();
                        } else if (featureState.reason) {
                            window.showErrorMessage(featureState.reason);
                        }
                    }
                },
            ],
        };
        this.statusBarButton.show();
    }

    private async enableStatusBarButton() {
        const featureState = await this.featureManager.isEnabled(
            "debugging.dbconnect"
        );
        if (featureState.isDisabledByFf) {
            return;
        }
        this.statusBarButton.name = "DB Connect V2 Enabled";
        this.statusBarButton.text = "DB Connect V2 Enabled";
        this.statusBarButton.tooltip = "DB Connect V2 Enabled";
        this.statusBarButton.backgroundColor = undefined;
        this.statusBarButton.command = {
            title: "Call",
            command: "databricks.call",
            arguments: [
                () => {
                    this.featureManager.isEnabled("debugging.dbconnect", true);
                },
            ],
        };
        this.statusBarButton.show();
    }

    private async getPatToken() {
        const headers: Record<string, string> = {};
        await this.connectionManager.workspaceClient?.apiClient.config.authenticate(
            headers
        );
        return headers["Authorization"]?.split(" ")[1];
    }

    private async userAgent() {
        const client = this.connectionManager.workspaceClient?.apiClient;
        if (!client) {
            return;
        }
        const userAgent = [
            `${client.product}/${client.productVersion}`,
            `os/${process.platform}`,
        ];

        const env = await this.pythonExtension.pythonEnvironment;
        if (env && env.version) {
            const {major, minor} = env.version;
            userAgent.push(`python/${major}.${minor}`);
        }

        return userAgent.join(" ");
    }

    private async getDatabrickseEnvVars(): Promise<
        Record<string, string | undefined> | undefined
    > {
        await this.connectionManager.waitForConnect();
        const featureState = await this.featureManager.isEnabled(
            "debugging.dbconnect"
        );

        if (!featureState.avaliable) {
            this.disableStatusBarButton();
            return;
        }
        const cluster = this.connectionManager.cluster;
        const host = this.connectionManager.databricksWorkspace?.host.authority;
        const pat = await this.getPatToken();
        const userAgent = await this.userAgent();
        if (!cluster || !pat || !host || !userAgent) {
            return;
        }
        /* eslint-disable @typescript-eslint/naming-convention */
        return {
            DATABRICKS_CLUSTER_ID: cluster.id,
            SPARK_REMOTE: `sc://${host}:443/;token=${pat};use_ssl=true;x-databricks-cluster-id=${
                cluster.id
            };user_agent=${encodeURIComponent(userAgent)}`,
            DATABRICKS_HOST: host,
            DATABRICKS_TOKEN: pat,
        };
        /* eslint-enable @typescript-eslint/naming-convention */
    }

    @logging.withLogContext(Loggers.Extension)
    async writeFile(@context ctx?: Context) {
        const databricksEnvVars = await this.getDatabrickseEnvVars();
        let userEnvVars: Record<string, string | undefined> = {};
        try {
            userEnvVars = (await readFile(this.userEnvPath.fsPath, "utf-8"))
                .split(/\r?\n/)
                .map((value) => {
                    const splits = value.split("=");
                    return [splits[0], splits.slice(1).join("=")];
                })
                .filter(([key, value]) => key.length && value.length)
                .reduce((prev: Record<string, string>, cur) => {
                    if (!Object.keys(prev).includes(cur[0])) {
                        prev[cur[0]] = cur[1];
                    }
                    return prev;
                }, {});
        } catch (e: unknown) {
            ctx?.logger?.error("Can't load .env file", e);
        }
        const data = Object.entries({
            ...databricksEnvVars,
            ...userEnvVars,
        }).map(([key, value]) => `${key}="${value}"`);
        try {
            const oldData = await readFile(
                this.databricksEnvPath.fsPath,
                "utf-8"
            );
            if (oldData !== data.join(os.EOL)) {
                this.onDidChangeEnvironmentVariablesEmitter.fire();
            }
        } catch {}
        await writeFile(
            this.databricksEnvPath.fsPath,
            data.join(os.EOL),
            "utf-8"
        );
        if (databricksEnvVars) {
            this.enableStatusBarButton();
        }
    }

    async emitToTerminal() {
        const databricksEnvVars = await this.getDatabrickseEnvVars();
        if (!databricksEnvVars) {
            return;
        }
        Object.entries(databricksEnvVars).forEach(([key, value]) => {
            if (value === undefined) {
                return;
            }
            this.extensionContext.environmentVariableCollection.replace(
                key,
                value
            );
        });
    }

    async clearTerminalEnv() {
        this.extensionContext.environmentVariableCollection.clear();
    }

    dispose() {
        this.clearTerminalEnv();
        this.disposables.forEach((i) => i.dispose());
    }
}
