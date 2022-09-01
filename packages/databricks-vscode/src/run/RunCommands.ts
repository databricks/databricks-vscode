import {debug, ExtensionContext, Uri, window} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";

/**
 * Run related commands
 */
export class RunCommands {
    constructor(
        private connectionManager: ConnectionManager,
        private context: ExtensionContext
    ) {}

    /**
     * Run a Python file using the command execution API
     */
    runEditorContentsCommand() {
        return async (resource: Uri) => {
            let targetResource = this.getTargetResource(resource);
            if (targetResource) {
                debug.startDebugging(
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
                debug.startDebugging(
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
