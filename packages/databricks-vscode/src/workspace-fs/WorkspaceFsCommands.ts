import {
    WorkspaceFsDir,
    WorkspaceFsEntity,
    WorkspaceFsUtils,
} from "@databricks/databricks-sdk";
import {context, Context} from "@databricks/databricks-sdk/dist/context";
import {withLogContext} from "@databricks/databricks-sdk/dist/logging";
import {Disposable, Uri, window} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {RemoteUri, REPO_NAME_SUFFIX} from "../sync/SyncDestination";
import {Loggers} from "../logger";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {createDirWizard} from "./createDirectoryWizard";
import {WorkspaceFsDataProvider} from "./WorkspaceFsDataProvider";
import path from "node:path";
import {WorkspaceStateManager} from "../vscode-objs/WorkspaceState";

export class WorkspaceFsCommands implements Disposable {
    private disposables: Disposable[] = [];

    constructor(
        private _workspaceFolder: Uri,
        private readonly _workspaceState: WorkspaceStateManager,
        private _connectionManager: ConnectionManager,
        private _workspaceFsDataProvider: WorkspaceFsDataProvider
    ) {
        this.disposables.push(
            this._connectionManager.onDidChangeState(async (state) => {
                if (
                    state !== "CONNECTED" ||
                    !workspaceConfigs.enableFilesInWorkspace ||
                    this._connectionManager.syncDestinationMapper !== undefined
                ) {
                    return;
                }

                const root = await this.getValidRoot(
                    this._connectionManager.databricksWorkspace?.currentFsRoot
                        .path
                );

                const element = await root?.mkdir(
                    `${path.basename(
                        this._workspaceFolder.fsPath
                    )}-${this._workspaceState.fixedUUID.slice(0, 8)}`
                );
                if (element) {
                    this.attachSyncDestination(element);
                }
            })
        );
    }

    async attachSyncDestination(element: WorkspaceFsEntity) {
        await this._connectionManager.attachSyncDestination(
            new RemoteUri(element.path)
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

        if (!this._connectionManager.workspaceClient) {
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
            this._connectionManager.workspaceClient,
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
            this._connectionManager.databricksWorkspace?.currentFsRoot.path;

        const root = await this.getValidRoot(rootPath, ctx);

        const inputPath = await createDirWizard(
            this._workspaceFolder,
            workspaceConfigs.enableFilesInWorkspace
                ? "Directory Name"
                : "Repo Name",
            root
        );
        let created: WorkspaceFsEntity | undefined;

        if (inputPath !== undefined) {
            if (!workspaceConfigs.enableFilesInWorkspace) {
                created = await this.createRepo(
                    rootPath + "/" + inputPath + REPO_NAME_SUFFIX
                );
            } else if (root) {
                created = await root.mkdir(inputPath);
            }
            if (created === undefined) {
                window.showErrorMessage(`Can't create directory ${inputPath}`);
            }
        }

        if (created) {
            this._workspaceFsDataProvider.refresh();
            return created;
        }
    }

    private async createRepo(repoPath: string) {
        const wsClient = this._connectionManager.workspaceClient;
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
        this._workspaceFsDataProvider.refresh();
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
