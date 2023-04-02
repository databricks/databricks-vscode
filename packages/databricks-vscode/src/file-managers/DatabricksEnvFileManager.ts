import {Disposable, Uri, workspace} from "vscode";
import {writeFile, rm, readFile} from "fs/promises";
import {FeatureManager} from "../feature-manager/FeatureManager";
import {ConnectionManager} from "../configuration/ConnectionManager";
import os from "node:os";
import * as path from "node:path";
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
        private readonly workspacePath: Uri,
        private readonly featureManager: FeatureManager,
        private readonly connectionManager: ConnectionManager
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
                (state) => {
                    if (!state.avaliable) {
                        this.deleteFile();
                        return;
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
                    this.deleteFile();
                    return;
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
                    this.deleteFile();
                    return;
                }
                this.writeFile();
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

    async writeFile() {
        await this.connectionManager.waitForConnect();
        const cluster = this.connectionManager.cluster;
        const host = this.connectionManager.databricksWorkspace?.host.authority;
        const pat = await this.getPatToken();
        if (!cluster || !pat || !host) {
            return;
        }
        /* eslint-disable @typescript-eslint/naming-convention */
        const metaData: Record<string, string | undefined> = {
            CLUSTER_ID: cluster.id,
            SPARK_REMOTE: `sc://${host}:443/;token=${pat};use_ssl=true;x-databricks-cluster-id=${cluster.id}`,
        };
        const authEnvVars: Record<string, string | undefined> = {
            DATABRICKS_HOST: host,
            DATABRICKS_TOKEN: pat,
        };
        /* eslint-enable @typescript-eslint/naming-convention */
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
            ...metaData,
            ...authEnvVars,
            ...userEnvVars,
        }).map(([key, value]) => `${key}="${value}"`);
        await writeFile(
            this.databricksEnvPath.fsPath,
            data.join(os.EOL),
            "utf-8"
        );
    }

    @withLogContext(Loggers.Extension)
    async deleteFile(@context ctx?: Context) {
        try {
            await rm(this.databricksEnvPath.fsPath);
        } catch (e: unknown) {
            ctx?.logger?.error("Can't delete .databricks.env file", e);
        }
    }

    dispose() {
        this.deleteFile();
        this.disposables.forEach((i) => i.dispose());
    }
}
