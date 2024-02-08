import {debug, Uri, window} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {FileUtils} from "../utils";
import {LocalUri} from "../sync/SyncDestination";

/**
 * Run related commands
 */
export class RunCommands {
    constructor(private connection: ConnectionManager) {}

    /**
     * Run a Python file using the command execution API
     */
    runEditorContentsCommand() {
        return async (resource: Uri) => {
            const targetResource = this.getTargetResource(resource);
            if (targetResource) {
                if (await FileUtils.isNotebook(new LocalUri(targetResource))) {
                    await window.showErrorMessage(
                        'Use "Run File as Workflow on Databricks" for running notebooks'
                    );
                    return;
                }

                if (this.connection.state === "CONNECTING") {
                    await this.connection.waitForConnect();
                }

                await debug.startDebugging(
                    undefined,
                    {
                        type: "databricks",
                        name: "Upload and Run File on Databricks",
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
            const targetResource = this.getTargetResource(resource);
            if (targetResource) {
                if (this.connection.state === "CONNECTING") {
                    await this.connection.waitForConnect();
                }

                if (this.connection.syncDestinationMapper === undefined) {
                    throw new Error(
                        "No sync destination found. Maybe the databricks.yml is misconfgured."
                    );
                }

                await debug.startDebugging(
                    undefined,
                    {
                        type: "databricks-workflow",
                        name: "Run File on Databricks as Workflow",
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
