import {TreeItem, Uri, window, workspace} from "vscode";
import {ProjectModel} from "./ProjectModel";

/**
 * Cluster related commands
 */
export class ProjectCommands {
    constructor(private projectModel: ProjectModel) {}

    refreshCommand() {
        return () => {
            this.projectModel.refresh();
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

                const doc = await workspace.openTextDocument(uri);
                await window.showTextDocument(doc);
            }
        };
    }
}
