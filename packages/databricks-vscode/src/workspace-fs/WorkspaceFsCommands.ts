import {WorkspaceFsEntity, WorkspaceFsUtils} from "@databricks/databricks-sdk";
import {context, Context} from "@databricks/databricks-sdk/dist/context";
import {withLogContext} from "@databricks/databricks-sdk/dist/logging";
import {Disposable, Uri, window} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {REPO_NAME_SUFFIX} from "../configuration/SyncDestination";
import {Loggers} from "../logger";
import {createDirWizard} from "./createDirectoryWizard";
import {WorkspaceFsDataProvider} from "./WorkspaceFsDataProvider";

export class WorkspaceFsCommands implements Disposable {
    private disposables: Disposable[] = [];

    constructor(
        private _workspaceFolder: Uri,
        private _connectionManager: ConnectionManager,
        private _workspaceFsDataProvider: WorkspaceFsDataProvider
    ) {}

    async attachSyncDestination(element: WorkspaceFsEntity) {
        await this._connectionManager.attachSyncDestination(
            Uri.from({scheme: "wsfs", path: element.path})
        );
    }

    @withLogContext(Loggers.Extension)
    async createFolder(
        element?: WorkspaceFsEntity,
        type: "Repo" | "Folder" = "Folder",
        @context ctx?: Context
    ) {
        const rootPath =
            element?.path ??
            this._connectionManager.databricksWorkspace?.currentFsRoot.path;

        if (!this._connectionManager.workspaceClient) {
            window.showErrorMessage(`Login to create a new directory`);
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

        if (!WorkspaceFsUtils.isDirectory(root)) {
            ctx?.logger?.error(
                `Cannot create a directory as a child of a ${root?.type}`
            );
            window.showErrorMessage(
                `Cannot create a directory as a child of a ${root?.type}`
            );
            return;
        }

        const inputPath = await createDirWizard(
            this._workspaceFolder,
            type === "Repo" ? "Repo Name" : "Directory Name"
        );
        let created: WorkspaceFsEntity | undefined;

        if (inputPath !== undefined) {
            if (type === "Repo") {
                created = await this.createRepo(
                    rootPath + "/" + inputPath + REPO_NAME_SUFFIX
                );
            } else {
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
            window.showErrorMessage(`Login to create a new repo`);
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
