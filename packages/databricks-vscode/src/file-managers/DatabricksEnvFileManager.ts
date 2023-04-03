import {Disposable, Uri, workspace, ExtensionContext} from "vscode";
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

export class DatabricksEnvFileManager implements Disposable {
    private disposables: Disposable[] = [];
    private readonly databricksEnvPath: Uri;
    private readonly userEnvPath: Uri;

    constructor(
        workspacePath: Uri,
        private readonly featureManager: FeatureManager,
        private readonly connectionManager: ConnectionManager,
        private readonly extensionContext: ExtensionContext
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

        this.disposables.push(
            userEnvFileWatcher,
            userEnvFileWatcher.onDidChange(() => this.writeFile(), this),
            userEnvFileWatcher.onDidDelete(() => this.writeFile(), this),
            userEnvFileWatcher.onDidCreate(() => this.writeFile(), this),
            featureManager.onDidChangeState(
                "debugging.dbconnect",
                () => {
                    this.writeFile();
                    this.emitToTerminal();
                },
                this
            ),
            this.connectionManager.onDidChangeCluster(async (cluster) => {
                if (!cluster || this.connectionManager.state !== "CONNECTED") {
                    return;
                }
                this.writeFile();
                this.emitToTerminal();
            }, this),
            this.connectionManager.onDidChangeState(async () => {
                if (this.connectionManager.state !== "CONNECTED") {
                    return;
                }
                this.writeFile();
                this.emitToTerminal();
            }, this)
        );
    }

    async getPatToken() {
        const headers: Record<string, string> = {};
        await this.connectionManager.workspaceClient?.apiClient.config.authenticate(
            headers
        );
        return headers["Authorization"]?.split(" ")[1];
    }

    async getDatabrickseEnvVars(): Promise<
        Record<string, string | undefined> | undefined
    > {
        await this.connectionManager.waitForConnect();
        if (
            !(await this.featureManager.isEnabled("debugging.dbconnect"))
                .avaliable
        ) {
            return;
        }
        const cluster = this.connectionManager.cluster;
        const host = this.connectionManager.databricksWorkspace?.host.authority;
        const pat = await this.getPatToken();
        if (!cluster || !pat || !host) {
            return;
        }
        /* eslint-disable @typescript-eslint/naming-convention */
        return {
            DATABRICKS_CLUSTER_ID: cluster.id,
            SPARK_REMOTE: `sc://${host}:443/;token=${pat};use_ssl=true;x-databricks-cluster-id=${cluster.id}`,
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
        await writeFile(
            this.databricksEnvPath.fsPath,
            data.join(os.EOL),
            "utf-8"
        );
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
