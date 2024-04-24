import {Disposable, Uri, workspace, EventEmitter} from "vscode";
import {writeFile, readFile, stat} from "fs/promises";
import {FeatureManager} from "../feature-manager/FeatureManager";
import {ConnectionManager} from "../configuration/ConnectionManager";
import os from "node:os";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {SystemVariables} from "../vscode-objs/SystemVariables";
import {logging} from "@databricks/databricks-sdk";
import {Loggers} from "../logger";
import {Context, context} from "@databricks/databricks-sdk/dist/context";
import {EnvVarGenerators, FileUtils} from "../utils";
import {Mutex} from "../locking/Mutex";
import {ConfigModel} from "../configuration/models/ConfigModel";
import path from "path";

export class DatabricksEnvFileManager implements Disposable {
    private disposables: Disposable[] = [];
    private userEnvFileWatcherDisposables: Disposable[] = [];
    private mutex = new Mutex();
    public readonly databricksEnvPath: Uri;
    private userEnvPath?: Uri;
    private readonly systemVariableResolver = new SystemVariables(
        this.workspacePath
    );

    private readonly onDidChangeEnvironmentVariablesEmitter =
        new EventEmitter<void>();
    public readonly onDidChangeEnvironmentVariables =
        this.onDidChangeEnvironmentVariablesEmitter.event;

    constructor(
        private readonly workspacePath: Uri,
        private readonly featureManager: FeatureManager,
        private readonly connectionManager: ConnectionManager,
        private readonly configModel: ConfigModel
    ) {
        this.systemVariableResolver = new SystemVariables(this.workspacePath);
        this.databricksEnvPath = Uri.joinPath(
            this.workspacePath,
            ".databricks",
            ".databricks.env"
        );
    }

    private updateUserEnvFileWatcher() {
        const userEnvPath = workspaceConfigs.msPythonEnvFile
            ? Uri.file(
                  this.systemVariableResolver.resolve(
                      workspaceConfigs.msPythonEnvFile
                  )
              )
            : undefined;

        if (userEnvPath?.fsPath !== this.userEnvPath?.fsPath) {
            this.userEnvPath = userEnvPath;
        }

        this.userEnvFileWatcherDisposables.forEach((i) => i.dispose());

        if (this.userEnvPath === undefined) {
            return;
        }
        const userEnvFileWatcher = workspace.createFileSystemWatcher(
            this.userEnvPath.fsPath
        );

        this.userEnvFileWatcherDisposables.push(
            userEnvFileWatcher,
            userEnvFileWatcher.onDidChange(async () => {
                await this.writeFile();
            }, this),
            userEnvFileWatcher.onDidDelete(async () => {
                await this.writeFile();
            }, this),
            userEnvFileWatcher.onDidCreate(async () => {
                await this.writeFile();
            }, this)
        );
    }

    public async init() {
        await FileUtils.waitForDatabricksProject(
            this.workspacePath,
            this.connectionManager
        );

        const userEnvPath = workspaceConfigs.msPythonEnvFile
            ? Uri.file(
                  this.systemVariableResolver.resolve(
                      workspaceConfigs.msPythonEnvFile
                  )
              )
            : undefined;

        if (userEnvPath?.fsPath === this.databricksEnvPath.fsPath) {
            workspaceConfigs.msPythonEnvFile = path.join(
                "${workspaceRoot}",
                ".env"
            );
        }

        this.updateUserEnvFileWatcher();

        this.disposables.push(
            workspace.onDidChangeConfiguration(
                this.updateUserEnvFileWatcher,
                this,
                this.disposables
            ),
            this.featureManager.onDidChangeState(
                "environment.dependencies",
                () => {
                    this.writeFile();
                },
                this
            ),
            this.connectionManager.onDidChangeCluster(async () => {
                this.writeFile();
            }, this),
            this.connectionManager.onDidChangeState(async () => {
                this.writeFile();
            }, this)
        );
    }

    private getDatabrickseEnvVars() {
        return EnvVarGenerators.getCommonDatabricksEnvVars(
            this.connectionManager,
            this.configModel
        );
    }

    private getIdeEnvVars() {
        return EnvVarGenerators.getIdeEnvVars();
    }

    //Get env variables from user's .env file
    private async getUserEnvVars() {
        if (this.userEnvPath === undefined) {
            return;
        }
        try {
            await stat(this.userEnvPath.fsPath);
        } catch (err) {
            logging.NamedLogger.getOrCreate(Loggers.Extension).debug(
                `${this.userEnvPath.fsPath} does not exist. Not loading user env vars and continuing.`
            );
            return;
        }
        return await EnvVarGenerators.getUserEnvVars(this.userEnvPath);
    }

    async getEnv() {
        return Object.fromEntries(
            Object.entries({
                ...(this.getDatabrickseEnvVars() || {}),
                ...((await EnvVarGenerators.getDbConnectEnvVars(
                    this.connectionManager,
                    this.workspacePath
                )) || {}),
                ...this.getIdeEnvVars(),
                ...((await this.getUserEnvVars()) || {}),
            }).filter(([, value]) => value !== undefined) as [string, string][]
        );
    }

    @logging.withLogContext(Loggers.Extension)
    async writeFile(@context ctx?: Context) {
        await this.connectionManager.waitForConnect();

        await this.mutex.wait();
        try {
            const data = Object.entries(await this.getEnv()).map(
                ([key, value]) => `${key}=${value}`
            );
            data.sort();
            try {
                const oldData = await readFile(
                    this.databricksEnvPath.fsPath,
                    "utf-8"
                );
                if (oldData === data.join(os.EOL)) {
                    return;
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
                this.onDidChangeEnvironmentVariablesEmitter.fire();
            } catch (e) {
                ctx?.logger?.info("Error writing databricks.env file", e);
            }
        } finally {
            this.mutex.signal();
        }
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
