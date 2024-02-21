import {Disposable, Uri, workspace, EventEmitter} from "vscode";
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
import {DbConnectStatusBarButton} from "../language/DbConnectStatusBarButton";
import {EnvVarGenerators, FileUtils} from "../utils";
import {Mutex} from "../locking/Mutex";
import {ConfigModel} from "../configuration/models/ConfigModel";

export class DatabricksEnvFileManager implements Disposable {
    private disposables: Disposable[] = [];
    private mutex = new Mutex();
    private readonly unresolvedDatabricksEnvFile: string;
    public readonly databricksEnvPath: Uri;
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
        private readonly configModel: ConfigModel
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

        this.userEnvPath = Uri.file(
            systemVariableResolver.resolve(
                workspaceConfigs.userEnvFile ??
                    path.join("${workspaceFolder}", ".env")
            )
        );
    }

    public async init() {
        await FileUtils.waitForDatabricksProject(
            this.workspacePath,
            this.connectionManager
        );

        const userEnvFileWatcher = workspace.createFileSystemWatcher(
            this.userEnvPath.fsPath
        );

        this.disposables.push(
            userEnvFileWatcher,
            userEnvFileWatcher.onDidChange(async () => {
                await this.writeFile();
            }, this),
            userEnvFileWatcher.onDidDelete(async () => {
                await this.writeFile();
            }, this),
            userEnvFileWatcher.onDidCreate(async () => {
                await this.writeFile();
            }, this),
            this.featureManager.onDidChangeState(
                "notebooks.dbconnect",
                async () => {
                    await this.writeFile();
                }
            ),
            this.featureManager.onDidChangeState(
                "debugging.dbconnect",
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
                this.dbConnectStatusBarButton.update();
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
