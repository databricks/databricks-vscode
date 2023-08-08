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
                    this.emitToTerminal();
                    this.writeFile();
                }
            ),
            this.featureManager.onDidChangeState(
                "debugging.dbconnect",
                () => {
                    this.emitToTerminal();
                    this.writeFile();
                },
                this
            ),
            this.connectionManager.onDidChangeCluster(async () => {
                this.emitToTerminal();
                this.writeFile();
            }, this),
            this.connectionManager.onDidChangeState(async () => {
                this.emitToTerminal();
                this.writeFile();
            }, this)
        );
    }

    private getDatabrickseEnvVars() {
        return EnvVarGenerators.getCommonDatabricksEnvVars(
            this.connectionManager
        );
    }

    private getNotebookEnvVars() {
        return EnvVarGenerators.getNotebookEnvVars(
            this.featureManager,
            this.notebookInitScriptManager
        );
    }

    private getIdeEnvVars() {
        return EnvVarGenerators.getIdeEnvVars();
    }

    //Get env variables from user's .env file
    private async getUserEnvVars() {
        return await EnvVarGenerators.getUserEnvVars(this.userEnvPath);
    }

    @logging.withLogContext(Loggers.Extension)
    async writeFile(@context ctx?: Context) {
        await this.connectionManager.waitForConnect();

        const data = Object.entries({
            ...(this.getDatabrickseEnvVars() || {}),
            ...((await EnvVarGenerators.getDbConnectEnvVars(
                this.connectionManager,
                this.workspacePath,
                this.featureManager
            )) || {}),
            ...this.getIdeEnvVars(),
            ...((await this.getUserEnvVars()) || {}),
            ...(await this.getNotebookEnvVars()),
            ...EnvVarGenerators.getDatabricksCliEnvVars(this.connectionManager),
        })
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => `${key}=${value}`);
        data.sort();
        try {
            const oldData = await readFile(
                this.databricksEnvPath.fsPath,
                "utf-8"
            );
            if (oldData !== data.join(os.EOL)) {
                this.onDidChangeEnvironmentVariablesEmitter.fire();
            }
        } catch (e) {
            ctx?.logger?.info("Error reading old databricks.env file", e);
        }
        try {
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
        await this.connectionManager.waitForConnect();

        Object.entries({
            ...(this.getDatabrickseEnvVars() || {}),
            ...this.getIdeEnvVars(),
            ...((await EnvVarGenerators.getDbConnectEnvVars(
                this.connectionManager,
                this.workspacePath,
                this.featureManager
            )) || {}),
            ...(await this.getNotebookEnvVars()),
            ...EnvVarGenerators.getDatabricksCliEnvVars(this.connectionManager),
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
