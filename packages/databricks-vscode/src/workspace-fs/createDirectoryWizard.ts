import {Uri, window} from "vscode";
import path from "path";

export async function createDirWizard(
    workspaceFolder: Uri,
    title: string
): Promise<string | undefined> {
    return await window.showInputBox({
        title: title,
        placeHolder: path.basename(workspaceFolder.fsPath),
        value: path.basename(workspaceFolder.fsPath),
        validateInput: (input) => {
            if (input === "") {
                return "Please enter a name";
            }
            if (input.includes("/")) {
                return "Invalid name: Folders cannot contain '/'";
            }
        },
    });
}
