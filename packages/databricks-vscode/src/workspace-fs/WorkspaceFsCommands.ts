import {ApiError, logging, context, Context} from "@databricks/databricks-sdk";
import {
    WorkspaceFsDir,
    WorkspaceFsEntity,
    WorkspaceFsUtils,
} from "../sdk-extensions";
import {Disposable, Uri, window} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {RemoteUri, REPO_NAME_SUFFIX} from "../sync/SyncDestination";
import {Loggers} from "../logger";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {createDirWizard} from "./createDirectoryWizard";
import {WorkspaceFsDataProvider} from "./WorkspaceFsDataProvider";
import path from "node:path";
import {StateStorage} from "../vscode-objs/StateStorage";

const withLogContext = logging.withLogContext;

export class WorkspaceFsCommands implements Disposable {
    private disposables: Disposable[] = [];

    constructor(
        private workspaceFolder: Uri,
        private readonly stateStorage: StateStorage,
        private connectionManager: ConnectionManager,
        private workspaceFsDataProvider: WorkspaceFsDataProvider
    ) {
        this.disposables.push(
            this.connectionManager.onDidChangeState(async (state) => {
                if (
                    state !== "CONNECTED" ||
                    !workspaceConfigs.enableFilesInWorkspace ||
                    this.connectionManager.syncDestinationMapper !== undefined
                ) {
                    return;
                }

                const root = await this.getValidRoot(
                    this.connectionManager.databricksWorkspace?.currentFsRoot
                        .path
                );

                const element = await root?.mkdir(
                    `${path.basename(
                        this.workspaceFolder.fsPath
                    )}-${this.stateStorage
                        .get("databricks.fixedUUID")
                        .slice(0, 8)}`
                );
                if (element) {
                    await this.connectionManager.attachSyncDestination(
                        new RemoteUri(element.path)
                    );
                }
            })
        );
    }

    @withLogContext(Loggers.Extension)
    async getValidRoot(
        rootPath?: string,
        @context ctx?: Context
    ): Promise<WorkspaceFsDir | undefined> {
        if (!workspaceConfigs.enableFilesInWorkspace) {
            return;
        }

        if (!this.connectionManager.workspaceClient) {
            window.showErrorMessage(
                `Please login first to create a new directory`
            );
            return;
        }

        if (!rootPath) {
            ctx?.logger?.error(
                "No root path when trying to create a directory"
            );
            window.showErrorMessage("Error when creating a new directory");
            return;
        }

        const root = await WorkspaceFsEntity.fromPath(
            this.connectionManager.workspaceClient,
            rootPath
        );

        if (root === undefined) {
            ctx?.logger?.error(`Can't fetch details for ${rootPath}. `);
            window.showErrorMessage(`Can't fetch details for ${rootPath}. `);
            return;
        }

        if (!WorkspaceFsUtils.isDirectory(root)) {
            ctx?.logger?.error(
                `Cannot create a directory as a child of a ${root?.type}`
            );
            window.showErrorMessage(
                `Cannot create a directory as a child of a ${root?.type}`
            );
            return;
        }

        return root;
    }

    @withLogContext(Loggers.Extension)
    async createFolder(element?: WorkspaceFsEntity, @context ctx?: Context) {
        const rootPath =
            element?.path ??
            this.connectionManager.databricksWorkspace?.currentFsRoot.path;

        const root = await this.getValidRoot(rootPath, ctx);

        const inputPath = await createDirWizard(
            this.workspaceFolder,
            workspaceConfigs.enableFilesInWorkspace
                ? "Directory Name"
                : "Repo Name",
            root
        );
        let created: WorkspaceFsEntity | undefined;

        if (inputPath !== undefined) {
            try {
                if (!workspaceConfigs.enableFilesInWorkspace) {
                    created = await this.createRepo(
                        rootPath + "/" + inputPath + REPO_NAME_SUFFIX
                    );
                } else if (root) {
                    created = await root.mkdir(inputPath);
                }
            } catch (e: unknown) {
                if (e instanceof ApiError) {
                    window.showErrorMessage(
                        `Can't create directory ${inputPath}: ${e.message}`
                    );
                    return;
                }
            }
        }

        if (created === undefined) {
            window.showErrorMessage(`Can't create directory ${inputPath}`);
            return;
        }

        this.workspaceFsDataProvider.refresh();
        return created;
    }

    private async createRepo(repoPath: string) {
        const wsClient = this.connectionManager.workspaceClient;
        if (!wsClient) {
            window.showErrorMessage(`Please login first to create a new repo`);
            return;
        }

        await wsClient.repos.create({
            path: repoPath,
            provider: "github",
            url: "https://github.com/databricks/databricks-empty-ide-project",
        });

        return await WorkspaceFsEntity.fromPath(wsClient, repoPath);
    }

    async refresh() {
        this.workspaceFsDataProvider.refresh();
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
