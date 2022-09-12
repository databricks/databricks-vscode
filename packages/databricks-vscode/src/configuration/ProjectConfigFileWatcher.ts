import {Disposable, workspace} from "vscode";
import {ConnectionManager} from "./ConnectionManager";
import {ProjectConfigFile} from "./ProjectConfigFile";

export class ProjectConfigFileWatcher implements Disposable {
    private disposables: Array<Disposable> = [];
    constructor(
        readonly connectionManager: ConnectionManager,
        rootPath?: string
    ) {
        const fileSystemWatcher = workspace.createFileSystemWatcher(
            ProjectConfigFile.getProjectConfigFilePath(rootPath)
        );

        this.disposables.push(
            fileSystemWatcher,
            fileSystemWatcher.onDidCreate(async (e) => {
                if (connectionManager.state !== "CONNECTED") {
                    connectionManager.login();
                }
            }, this),
            fileSystemWatcher.onDidChange(async (e) => {
                const configFile = await ProjectConfigFile.load(rootPath);
                if (configFile.profile !== connectionManager.profile) {
                    connectionManager.login();
                }
            }, this),
            fileSystemWatcher.onDidDelete((e) => {
                connectionManager.logout();
            }, this)
        );
    }
    dispose() {
        this.disposables.forEach((item) => item.dispose());
    }
}
