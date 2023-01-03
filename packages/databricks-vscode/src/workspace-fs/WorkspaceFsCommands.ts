import {Disposable, Uri, window} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {IFsTreeItem, WorkspaceFsDataProvider} from "./WorkspaceFsDataProvider";

export class WorkspaceFsCommands implements Disposable {
    private disposables: Disposable[] = [];

    constructor(
        private _connectionManager: ConnectionManager,
        private _workspaceFsDataProvider: WorkspaceFsDataProvider
    ) {}

    async attachSyncDestination(element: IFsTreeItem) {
        await this._connectionManager.attachSyncDestination(
            Uri.from({
                scheme: "wsfs",
                path: element.path,
            })
        );
    }
    //TODO
    async createFolder(element: IFsTreeItem) {
        let name = await window.showInputBox({placeHolder: "New Folder"});
        if (name === undefined) {
            return;
        }

        if (name === "") {
            name = "New Folder";
        }
    }

    async refresh() {
        this._workspaceFsDataProvider.refresh();
    }
    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
