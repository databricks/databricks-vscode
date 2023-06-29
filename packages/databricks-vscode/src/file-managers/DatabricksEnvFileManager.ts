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
import {FileUtils} from "../utils";

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
        private readonly pythonExtension: MsPythonExtensionWrapper
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
        const cluster = this.connectionManager.cluster;
        const userAgent = await this.userAgent();
        const authProvider =
            this.connectionManager.databricksWorkspace?.authProvider;
        if (!userAgent || !authProvider) {
            return;
        }

        const authEnvVars: Record<string, string> = authProvider.toEnv();

        const host = this.connectionManager.databricksWorkspace?.host.authority;
        const pat = await this.getPatToken();
        const sparkEnvVars: Record<string, string> = {};
        if (pat && host && cluster) {
            sparkEnvVars[
                "SPARK_REMOTE"
            ] = `sc://${host}:443/;token=${pat};use_ssl=true;x-databricks-cluster-id=${cluster.id};user_agent=vs_code`; //;user_agent=${encodeURIComponent(userAgent)}`
        }

        /* eslint-disable @typescript-eslint/naming-convention */
        return {
            ...authEnvVars,
            ...sparkEnvVars,
            DATABRICKS_CLUSTER_ID: cluster?.id,
        };
        /* eslint-enable @typescript-eslint/naming-convention */
    }

    private getIdeEnvVars() {
        /* eslint-disable @typescript-eslint/naming-convention */
        return {
            PYDEVD_WARN_SLOW_RESOLVE_TIMEOUT: "10",
        };
        /* eslint-enable @typescript-eslint/naming-convention */
    }

    //Get env variables from user's .env file
    @logging.withLogContext(Loggers.Extension)
    private async getUserEnvVars(@context ctx?: Context) {
        try {
            return (await readFile(this.userEnvPath.fsPath, "utf-8"))
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
    }

    @logging.withLogContext(Loggers.Extension)
    async writeFile(@context ctx?: Context) {
        const databricksEnvVars = await this.getDatabrickseEnvVars();
        const data = Object.entries({
            ...(databricksEnvVars || {}),
            ...this.getIdeEnvVars(),
            ...((await this.getUserEnvVars(ctx)) || {}),
        })
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => {
                value = value?.replaceAll(/ ^"|"$/g, ""); //strip quotes
                return `${key}="${value}"`;
            });
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
        this.dbConnectStatusBarButton.update();
    }

    async emitToTerminal() {
        Object.entries({
            ...((await this.getDatabrickseEnvVars()) || {}),
            ...this.getIdeEnvVars(),
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
