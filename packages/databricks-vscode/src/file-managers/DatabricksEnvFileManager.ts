import {Disposable, Uri, workspace, ExtensionContext} from "vscode";
import {writeFile, rm, readFile} from "fs/promises";
import {FeatureManager} from "../feature-manager/FeatureManager";
import {ConnectionManager} from "../configuration/ConnectionManager";
import os from "node:os";
import {withLogContext} from "@databricks/databricks-sdk/dist/logging";
import {Loggers} from "../logger";
import {Context, context} from "@databricks/databricks-sdk/dist/context";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {SystemVariables} from "../vscode-objs/SystemVariables";

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
        this.databricksEnvPath = Uri.joinPath(
            workspacePath,
            ".databricks",
            ".databricks.env"
        );

        const unresolvedUserEnvFile = workspaceConfigs.userEnvFile
            ? workspaceConfigs.userEnvFile
            : !workspaceConfigs.msPythonEnvFile ||
              workspaceConfigs.msPythonEnvFile.includes(
                  this.databricksEnvPath.fsPath
              )
            ? "${workspacePath}/.env"
            : workspaceConfigs.msPythonEnvFile;

        workspaceConfigs.msPythonEnvFile = this.databricksEnvPath.fsPath;
        workspaceConfigs.userEnvFile = unresolvedUserEnvFile;

        const systemVariableResolver = new SystemVariables(workspacePath);
        this.userEnvPath = Uri.file(
            systemVariableResolver.resolve(unresolvedUserEnvFile)
        );

        const userEnvFileWatcher = workspace.createFileSystemWatcher(
            this.userEnvPath.fsPath
        );

        this.disposables.push(
            userEnvFileWatcher,
            userEnvFileWatcher.onDidChange(this.writeFile, this),
            userEnvFileWatcher.onDidDelete(this.writeFile, this),
            userEnvFileWatcher.onDidCreate(this.writeFile, this),
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
    async writeFile() {
        const databricksEnvVars = await this.getDatabrickseEnvVars();
        const userEnvVars = (await readFile(this.userEnvPath.fsPath, "utf-8"))
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
