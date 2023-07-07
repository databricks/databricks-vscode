import {
    Disposable,
    Uri,
    workspace,
    ExtensionContext,
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
import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import {DbConnectStatusBarButton} from "../language/DbConnectStatusBarButton";
import {EnvVarGenerators, FileUtils} from "../utils";
import {NotebookInitScriptManager} from "../language/notebooks/NotebookInitScriptManager";

function isValidUserEnvPath(
    path: string | undefined,
    excludes: string[]
): path is string {
    return path !== undefined && !excludes.includes(path);
}
export class DatabricksEnvFileManager implements Disposable {
    private disposables: Disposable[] = [];

    private readonly unresolvedDatabricksEnvFile: string;
    private readonly databricksEnvPath: Uri;
    private readonly unresolvedUserEnvFile: string;
    private readonly userEnvPath: Uri;

    private readonly onDidChangeEnvironmentVariablesEmitter =
        new EventEmitter<void>();
    public readonly onDidChangeEnvironmentVariables =
        this.onDidChangeEnvironmentVariablesEmitter.event;

    constructor(
        private readonly workspacePath: Uri,
        private readonly featureManager: FeatureManager,
        private readonly dbConnectStatusBarButton: DbConnectStatusBarButton,
        private readonly connectionManager: ConnectionManager,
        private readonly extensionContext: ExtensionContext,
        private readonly pythonExtension: MsPythonExtensionWrapper,
        private readonly notebookInitScriptManager: NotebookInitScriptManager
    ) {
        const systemVariableResolver = new SystemVariables(workspacePath);
        this.unresolvedDatabricksEnvFile = path.join(
            "${workspaceFolder}",
            ".databricks",
            ".databricks.env"
        );
        this.databricksEnvPath = Uri.file(
            systemVariableResolver.resolve(this.unresolvedDatabricksEnvFile)
        );
        //Try to get user specified .env file fron databricks.python.envFile config
        //If that is not found, then try to read python.envFile config
        //Default to ${workspaceFolder}/.env.
        this.unresolvedUserEnvFile = isValidUserEnvPath(
            workspaceConfigs.userEnvFile,
            [this.unresolvedDatabricksEnvFile, this.databricksEnvPath.fsPath]
        )
            ? workspaceConfigs.userEnvFile
            : isValidUserEnvPath(workspaceConfigs.msPythonEnvFile, [
                  this.unresolvedDatabricksEnvFile,
                  this.databricksEnvPath.fsPath,
              ])
            ? workspaceConfigs.msPythonEnvFile
            : path.join("${workspaceFolder}", ".env");
        this.userEnvPath = Uri.file(
            systemVariableResolver.resolve(this.unresolvedUserEnvFile)
        );
        NamedLogger.getOrCreate(Loggers.Extension).debug("Env file locations", {
            unresolvedDatabricksEnvFile: this.unresolvedDatabricksEnvFile,
            unresolvedUserEnvFile: this.unresolvedUserEnvFile,
            msEnvFile: workspaceConfigs.msPythonEnvFile,
        });
    }

    public async init() {
        await FileUtils.waitForDatabricksProject(
            this.workspacePath,
            this.connectionManager
        );
        workspaceConfigs.msPythonEnvFile = this.unresolvedDatabricksEnvFile;
        workspaceConfigs.userEnvFile = this.unresolvedUserEnvFile;

        const userEnvFileWatcher = workspace.createFileSystemWatcher(
            this.userEnvPath.fsPath
        );

        this.disposables.push(
            userEnvFileWatcher,
            userEnvFileWatcher.onDidChange(() => this.writeFile(), this),
            userEnvFileWatcher.onDidDelete(() => this.writeFile(), this),
            userEnvFileWatcher.onDidCreate(() => this.writeFile(), this),
            this.featureManager.onDidChangeState(
                "notebooks.dbconnect",
                async () => {
                    await this.clearTerminalEnv();
                    await this.emitToTerminal();
                    await this.writeFile();
                }
            ),
            this.featureManager.onDidChangeState(
                "debugging.dbconnect",
                (featureState) => {
                    if (!featureState.avaliable) {
                        this.clearTerminalEnv();
                    } else {
                        this.emitToTerminal();
                    }
                    this.writeFile();
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
                } else {
                    this.emitToTerminal();
                }
                this.writeFile();
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
                } else {
                    this.emitToTerminal();
                }
                this.writeFile();
            }, this)
        );
    }

    public async getDatabrickseEnvVars() {
        return EnvVarGenerators.getDatabrickseEnvVars(
            this.connectionManager,
            this.workspacePath
        );
    }

    public async getNotebookEnvVars() {
        return EnvVarGenerators.getNotebookEnvVars(
            this.featureManager,
            this.notebookInitScriptManager
        );
    }

    public async getIdeEnvVars() {
        return EnvVarGenerators.getIdeEnvVars();
    }

    //Get env variables from user's .env file
    public async getUserEnvVars() {
        return EnvVarGenerators.getUserEnvVars(this.userEnvPath);
    }

    @logging.withLogContext(Loggers.Extension)
    async writeFile(@context ctx?: Context) {
        const data = Object.entries({
            ...((await this.getDatabrickseEnvVars()) || {}),
            ...(await this.getIdeEnvVars()),
            ...((await this.getUserEnvVars()) || {}),
            ...(await this.getNotebookEnvVars()),
            ...(await EnvVarGenerators.getProxyEnvVars()),
        })
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => `${key}=${value}`);
        try {
            const oldData = await readFile(
                this.databricksEnvPath.fsPath,
                "utf-8"
            );
            data.sort();
            if (oldData !== data.join(os.EOL)) {
                this.onDidChangeEnvironmentVariablesEmitter.fire();
            }
            await writeFile(
                this.databricksEnvPath.fsPath,
                data.join(os.EOL),
                "utf-8"
            );
            this.dbConnectStatusBarButton.update();
        } catch (e) {
            ctx?.logger?.info("Error writing databricks.env file", e);
        }
    }

    async emitToTerminal() {
        Object.entries({
            ...((await this.getDatabrickseEnvVars()) || {}),
            ...(await this.getIdeEnvVars()),
            ...(await this.getNotebookEnvVars()),
            ...(await EnvVarGenerators.getProxyEnvVars()),
        }).forEach(([key, value]) => {
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
