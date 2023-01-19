import {WorkspaceFsEntity, WorkspaceFsUtils} from "@databricks/databricks-sdk";
import {Disposable, ExtensionContext, Uri, window, workspace} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
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

    async createFolder(element: WorkspaceFsEntity) {
        const path =
            element?.path ??
            this._connectionManager.databricksWorkspace?.currentFsRoot.path;

        if (!this._connectionManager.workspaceClient || !path) {
            return;
        }

        const root = await WorkspaceFsEntity.fromPath(
            this._connectionManager.workspaceClient,
            path
        );

        if (!WorkspaceFsUtils.isDirectory(root)) {
            return;
        }

        const created = await createDirWizard(root, this._workspaceFolder);
        if (created) {
            this._workspaceFsDataProvider.refresh();
        }
    }

    async refresh() {
        this._workspaceFsDataProvider.refresh();
    }
    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
