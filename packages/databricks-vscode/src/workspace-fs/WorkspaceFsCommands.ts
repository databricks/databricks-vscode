import {ApiError, logging} from "@databricks/databricks-sdk";
import {
    WorkspaceFsDir,
    WorkspaceFsEntity,
    WorkspaceFsUtils,
} from "../sdk-extensions";
import {context, Context} from "@databricks/databricks-sdk/dist/context";
import {Disposable, window} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {Loggers} from "../logger";
import {createDirWizard} from "./createDirectoryWizard";
import {WorkspaceFsDataProvider} from "./WorkspaceFsDataProvider";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";

const withLogContext = logging.withLogContext;

export class WorkspaceFsCommands implements Disposable {
    private disposables: Disposable[] = [];

    constructor(
        private workspaceFolderManager: WorkspaceFolderManager,
        private connectionManager: ConnectionManager,
        private workspaceFsDataProvider: WorkspaceFsDataProvider
    ) {}

    @withLogContext(Loggers.Extension)
    async getValidRoot(
        rootPath?: string,
        @context ctx?: Context
    ): Promise<WorkspaceFsDir | undefined> {
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
            this.workspaceFolderManager.activeWorkspaceFolder.uri,
            "Directory Name",
            root
        );
        let created: WorkspaceFsEntity | undefined;

        if (inputPath !== undefined) {
            try {
                if (root) {
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
