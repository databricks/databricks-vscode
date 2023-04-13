import {Disposable, workspace} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {ProjectConfigFile} from "./ProjectConfigFile";
import {RemoteUri} from "../sync/SyncDestination";

export class ProjectConfigFileWatcher implements Disposable {
    private disposables: Array<Disposable> = [];
    constructor(
        readonly connectionManager: ConnectionManager,
        rootPath: string,
        bricksPath: string
    ) {
        const fileSystemWatcher = workspace.createFileSystemWatcher(
            ProjectConfigFile.getProjectConfigFilePath(rootPath)
        );

        this.disposables.push(
            fileSystemWatcher,
            fileSystemWatcher.onDidCreate(async () => {
                switch (this.connectionManager.state) {
                    case "DISCONNECTED":
                        await this.connectionManager.login();
                        break;
                    case "CONNECTING":
                        await this.connectionManager.waitForConnect();
                        break;
                    case "CONNECTED":
                        return;
                }
            }, this),
            fileSystemWatcher.onDidChange(async () => {
                const configFile = await ProjectConfigFile.load(
                    rootPath,
                    bricksPath
                );
                if (this.connectionManager.state === "CONNECTING") {
                    await this.connectionManager.waitForConnect();
                }
                if (
                    configFile.host.toString() !==
                        connectionManager.databricksWorkspace?.host.toString() ||
                    configFile.authProvider.authType !==
                        connectionManager.databricksWorkspace?.authProvider
                            .authType
                ) {
                    await connectionManager.login(false, true);
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
                    connectionManager.syncDestinationMapper?.remoteUri.path !==
                    configFile.workspacePath?.path
                ) {
                    if (configFile.workspacePath) {
                        await connectionManager.attachSyncDestination(
                            new RemoteUri(configFile.workspacePath?.path)
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
