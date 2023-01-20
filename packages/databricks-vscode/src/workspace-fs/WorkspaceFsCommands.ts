import {WorkspaceFsEntity, WorkspaceFsUtils} from "@databricks/databricks-sdk";
import {context, Context} from "@databricks/databricks-sdk/src/context";
import {withLogContext} from "@databricks/databricks-sdk/src/logging";
import {Disposable, ExtensionContext, Uri, window, workspace} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
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
    async createFolder(element?: WorkspaceFsEntity, @context ctx?: Context) {
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

        const created = await createDirWizard(root, this._workspaceFolder);
        if (created) {
            this._workspaceFsDataProvider.refresh();
            return created;
        }
    }

    async refresh() {
        this._workspaceFsDataProvider.refresh();
    }
    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
