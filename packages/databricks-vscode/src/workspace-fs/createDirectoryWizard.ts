import {Uri, window} from "vscode";
import {WorkspaceFsDir} from "@databricks/databricks-sdk";
import path from "path";

export async function createDirWizard(
    root: WorkspaceFsDir,
    workspaceFolder: Uri
) {
    const inputPath = await window.showInputBox({
        title: `Create new directory`,
        placeHolder: path.basename(workspaceFolder.fsPath),
        value: path.basename(workspaceFolder.fsPath),
        validateInput: (input) => {
            const childPath = root.getAbsoluteChildPath(input);
            if (childPath === undefined || childPath === root.path) {
                return `The path must be a child of ${root.path}`;
            }
        },
    });

    if (inputPath !== undefined) {
        return await root.mkdir(inputPath);
    }
}
