import {window} from "vscode";
import {WorkspaceFsDir} from "@databricks/databricks-sdk";

export async function createDirWizard(root: WorkspaceFsDir) {
    const path = await window.showInputBox({
        title: `Create new directory`,
        placeHolder: root.path,
        value: root.path,
        validateInput: (input) => {
            const childPath = root.getAbsoluteChildPath(input);
            if (childPath === undefined) {
                return `The path must be a child of ${root.path}`;
            }
        },
    });

    if (path !== undefined) {
        return await root.mkdir(path);
    }
}
