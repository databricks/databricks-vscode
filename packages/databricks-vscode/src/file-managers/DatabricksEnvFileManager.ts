import {Disposable, Uri, workspace} from "vscode";
import {writeFile, rm, readFile} from "fs/promises";
import {FeatureManager} from "../feature-manager/FeatureManager";
import {ConnectionManager} from "../configuration/ConnectionManager";
import os from "node:os";
import {withLogContext} from "@databricks/databricks-sdk/dist/logging";
import {Loggers} from "../logger";
import {Context, context} from "@databricks/databricks-sdk/dist/context";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";

export class DatabricksEnvFileManager implements Disposable {
    private disposables: Disposable[] = [];
    private readonly path: Uri;
    constructor(
        private readonly workspacePath: Uri,
        private readonly featureManager: FeatureManager,
        private readonly connectionManager: ConnectionManager
    ) {
        this.path = Uri.joinPath(
            workspacePath,
            ".databricks",
            ".databricks.env"
        );

        const fileSystemWatcher = workspace.createFileSystemWatcher(
            this.userEnvpath.fsPath
        );

        this.disposables.push(
            fileSystemWatcher,
            fileSystemWatcher.onDidChange(() => {
                this.writeFile();
            }),
            fileSystemWatcher.onDidDelete(() => {
                this.writeFile();
            }),
            fileSystemWatcher.onDidCreate(() => {
                this.writeFile();
            }),
            featureManager.onDidChangeState("debugging.dbconnect", (state) => {
                if (!state.avaliable) {
                    this.deleteFile();
                    return;
                }
                this.writeFile();
            }),
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
            }),
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
            })
        );
    }

    get userEnvpath() {
        return Uri.joinPath(
            this.workspacePath,
            workspaceConfigs.userEnvFilePath
        );
    }

    async writeFile() {
        await this.connectionManager.waitForConnect();
        const cluster = this.connectionManager.cluster;
        if (!cluster) {
            return;
        }
        const data = [`CLUSTER_ID="${cluster.id}"`];

        const authEnvVars =
            this.connectionManager.databricksWorkspace?.authProvider.getEnvVars() ??
            {};
        Object.entries(authEnvVars)
            .filter(([key, value]) => value !== undefined)
            .forEach(([key, value]) => {
                data.push(`${key}="${value}"`);
            });

        data.push(
            ...(await readFile(this.userEnvpath.fsPath, "utf-8")).split(/\r?\n/)
        );
        await writeFile(this.path.fsPath, data.join(os.EOL), "utf-8");
    }

    @withLogContext(Loggers.Extension)
    async deleteFile(@context ctx?: Context) {
        try {
            await rm(this.path.fsPath);
        } catch (e: unknown) {
            ctx?.logger?.error("Can't delete .databricks.env file", e);
        }
    }

    dispose() {
        this.deleteFile();
        this.disposables.forEach((i) => i.dispose());
    }
}
