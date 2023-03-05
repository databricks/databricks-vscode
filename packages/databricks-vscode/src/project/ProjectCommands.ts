import {basename, dirname} from "path";
import {TreeItem, Uri, window, workspace} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {ProjectModel} from "./ProjectModel";

/**
 * Cluster related commands
 */
export class ProjectCommands {
    constructor(
        private projectModel: ProjectModel,
        private connetionManager: ConnectionManager
    ) {}

    refreshCommand() {
        return () => {
            this.projectModel.scheduleRefresh();
        };
    }

    runCommand() {
        return async (node: any) => {
            const name: string | undefined = (node as any).name as string;
            if (name) {
                await this.projectModel.run(name);
            }
        };
    }

    deployCommand() {
        return async () => {
            await this.projectModel.deploy();
        };
    }

    openFileCommand() {
        return async (node: TreeItem) => {
            const path: string | undefined = (node as any).localPath as string;
            if (path) {
                const uri = Uri.joinPath(
                    workspace.workspaceFolders![0].uri,
                    path
                );

                // write empty file if it doesn't exist
                try {
                    await workspace.fs.stat(uri);
                } catch (e) {
                    await workspace.fs.createDirectory(
                        Uri.file(dirname(uri.fsPath))
                    );
                    await workspace.fs.writeFile(uri, Buffer.from(""));
                }

                const doc = await workspace.openTextDocument(uri);
                await window.showTextDocument(doc);
            }
        };
    }

    createProjectCommand() {
        return async () => {
            const workspaceClient = this.connetionManager.workspaceClient;
            if (!workspaceClient) {
                // TODO
                return;
            }

            // TODO support more auth methods
            const profile = workspaceClient.apiClient.config!.profile;

            const rootDir = workspace.workspaceFolders![0].uri;
            const projectName = await window.showInputBox({
                title: "Project name",
                value: basename(rootDir.fsPath),
            });

            const bundleFile = Uri.joinPath(rootDir, "bundle.yml");
            await workspace.fs.writeFile(
                bundleFile,
                Buffer.from(`bundle:
  name: ${projectName}

environments:
  development:
    default: true

    # Configure the workspace to use for development
    workspace:
      profile: ${profile}`)
            );

            const doc = await workspace.openTextDocument(bundleFile);
            await window.showTextDocument(doc);
            await this.projectModel.scheduleRefresh();
        };
    }
}
