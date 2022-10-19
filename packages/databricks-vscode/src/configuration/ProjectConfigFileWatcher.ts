import {Disposable, Uri, workspace} from "vscode";
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
                    await connectionManager.login();
                }
            }, this),
            fileSystemWatcher.onDidChange(async (e) => {
                const configFile = await ProjectConfigFile.load(rootPath);
                if (configFile.profile !== connectionManager.profile) {
                    await connectionManager.login();
                }
                if (connectionManager.cluster?.id !== configFile.clusterId) {
                    if (configFile.clusterId) {
                        await connectionManager.attachCluster(
                            configFile.clusterId
                        );
                    } else {
                        await connectionManager.detachCluster();
                    }
                }
                if (
                    connectionManager.syncDestination?.path.path !==
                    configFile.workspacePath
                ) {
                    if (configFile.workspacePath) {
                        await connectionManager.attachSyncDestination(
                            Uri.from({
                                scheme: "dbws",
                                path: configFile.workspacePath,
                            })
                        );
                    } else {
                        await connectionManager.detachSyncDestination();
                    }
                }
            }, this),
            fileSystemWatcher.onDidDelete(async (e) => {
                await connectionManager.logout();
            }, this)
        );
    }
    dispose() {
        this.disposables.forEach((item) => item.dispose());
    }
}
