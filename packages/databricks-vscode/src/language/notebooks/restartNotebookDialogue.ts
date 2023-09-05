import {workspace, window, commands} from "vscode";
import {DatabricksEnvFileManager} from "../../file-managers/DatabricksEnvFileManager";
import {Mutex} from "../../locking";

export function showRestartNotebookDialogue(
    databricksEnvFileManager: DatabricksEnvFileManager
) {
    const mutex = new Mutex();
    return databricksEnvFileManager.onDidChangeEnvironmentVariables(
        async () => {
            if (!workspace.notebookDocuments.length || mutex.locked) {
                return;
            }
            await mutex.wait();
            try {
                const choice = await window.showInformationMessage(
                    "Environment variables have changed. Restart all jupyter kernels to pickup the latest environment variables. ",
                    {
                        modal: true,
                    },
                    "Restart All Jupyter Kernels",
                    "Cancel"
                );

                if (choice === "Restart All Jupyter Kernels") {
                    for (const doc of workspace.notebookDocuments) {
                        if (doc.isClosed) {
                            return;
                        }
                        await doc.save();
                        await window.showNotebookDocument(doc);
                        await commands.executeCommand(
                            "workbench.action.closeActiveEditor"
                        );
                    }
                }
            } finally {
                mutex.signal();
            }
        }
    );
}
