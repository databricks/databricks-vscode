import {commands, debug, Uri, window} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {CodeSynchronizer} from "../sync";
import {isNotebook} from "../utils";

/**
 * Run related commands
 */
export class RunCommands {
    constructor(
        private connection: ConnectionManager,
        private codeSynchroniser: CodeSynchronizer
    ) {}

    /**
     * Run a Python file using the command execution API
     */
    runEditorContentsCommand() {
        return async (resource: Uri) => {
            let targetResource = this.getTargetResource(resource);
            if (targetResource) {
                if (await isNotebook(targetResource)) {
                    await window.showErrorMessage(
                        'Use "Run File as Workflow on Databricks" for running notebooks'
                    );
                    return;
                }

                if (this.connection.state === "CONNECTING") {
                    await this.connection.waitForConnect();
                }

                if (this.codeSynchroniser.state === "STOPPED") {
                    await commands.executeCommand("databricks.sync.start");
                }
                await debug.startDebugging(
                    undefined,
                    {
                        type: "databricks",
                        name: "Run File on Databricks",
                        request: "launch",
                        program: targetResource.fsPath,
                    },
                    {noDebug: true}
                );
            }
        };
    }

    /**
     * Run a Python file or notebook as a workflow on the connected cluster
     */
    runEditorContentsAsWorkflowCommand() {
        return async (resource: Uri) => {
            let targetResource = this.getTargetResource(resource);
            if (targetResource) {
                if (this.connection.state === "CONNECTING") {
                    await this.connection.waitForConnect();
                }

                if (this.codeSynchroniser.state === "STOPPED") {
                    await commands.executeCommand("databricks.sync.start");
                }
                await debug.startDebugging(
                    undefined,
                    {
                        type: "databricks-workflow",
                        name: "Run File Run File on Databricks as Workflow",
                        request: "launch",
                        program: targetResource.fsPath,
                    },
                    {noDebug: true}
                );
            }
        };
    }

    private getTargetResource(resource: Uri): Uri | undefined {
        if (!resource && window.activeTextEditor) {
            return window.activeTextEditor.document.uri;
        }
        return resource;
    }
}
