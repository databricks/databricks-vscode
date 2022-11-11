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
            fileSystemWatcher.onDidCreate(async () => {
                if (connectionManager.state !== "CONNECTED") {
                    await connectionManager.login();
                }
            }, this),
            fileSystemWatcher.onDidChange(async () => {
                const configFile = await ProjectConfigFile.load(rootPath);
                if (
                    configFile.profile !==
                    connectionManager.databricksWorkspace?.profile
                ) {
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
                                scheme: "wsfs",
                                path: configFile.workspacePath,
                            })
                        );
                    } else {
                        await connectionManager.detachSyncDestination();
                    }
                }
            }, this),
            fileSystemWatcher.onDidDelete(async () => {
                await connectionManager.logout();
            }, this)
        );
    }
    dispose() {
        this.disposables.forEach((item) => item.dispose());
    }
}
