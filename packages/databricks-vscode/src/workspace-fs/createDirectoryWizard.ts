import {Uri, window} from "vscode";
import path from "path";
import {WorkspaceFsDir} from "../sdk-extensions";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";

export async function createDirWizard(
    workspaceFolder: Uri,
    title: string,
    root?: WorkspaceFsDir
): Promise<string | undefined> {
    return await window.showInputBox({
        title: title,
        placeHolder: path.basename(workspaceFolder.fsPath),
        value: path.basename(workspaceFolder.fsPath),
        validateInput: (input) => {
            if (workspaceConfigs.enableFilesInWorkspace && root) {
                const childPath = root.getAbsoluteChildPath(input);
                if (childPath === undefined || childPath === root.path) {
                    return `The path must be a child of ${root.path}`;
                }
            }
            if (input === "") {
                return "Please enter a name";
            }
            if (input.includes("/")) {
                return "Invalid name: Folders cannot contain '/'";
            }
        },
    });
}
