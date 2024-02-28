import {debug, ExtensionContext, Uri, window, WorkspaceFolder} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {FileUtils} from "../utils";
import {LocalUri} from "../sync/SyncDestination";
import {DatabricksPythonDebugConfiguration} from "./DatabricksDebugConfigurationProvider";
import {MsPythonExtensionWrapper} from "../language/MsPythonExtensionWrapper";
import path from "path";

/**
 * Run related commands
 */
export class RunCommands {
    constructor(
        private connection: ConnectionManager,
        private readonly workspaceFolder: WorkspaceFolder,
        private readonly pythonExtension: MsPythonExtensionWrapper,
        private readonly context: ExtensionContext
    ) {}

    /**
     * Run a Python file using the command execution API
     */
    runEditorContentsCommand() {
        return async (resource?: Uri) => {
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
        return async (resource?: Uri) => {
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

    private getTargetResource(resource?: Uri): Uri | undefined {
        if (!resource && window.activeTextEditor) {
            return window.activeTextEditor.document.uri;
        }
        return resource;
    }

    debugFileUsingDbconnect(resource: Uri) {
        const targetResource = this.getTargetResource(resource);
        if (!targetResource) {
            window.showErrorMessage("Open a file to run");
            return;
        }
        const config: DatabricksPythonDebugConfiguration = {
            program: targetResource.fsPath,
            type: "python",
            name: "Databricks Connect",
            request: "launch",
            databricks: true,
            console: "integratedTerminal",
            env: {...process.env},
        };

        debug.startDebugging(this.workspaceFolder, config);
    }

    async runFileUsingDbconnect(resource: Uri) {
        const targetResource = this.getTargetResource(resource);
        if (!targetResource) {
            window.showErrorMessage("Open a file to run");
            return;
        }

        const executable = await this.pythonExtension.getPythonExecutable();
        if (!executable) {
            window.showErrorMessage("No python executable found");
        }

        const terminal = window.activeTerminal ?? window.createTerminal();
        const bootstrapPath = this.context.asAbsolutePath(
            path.join("resources", "python", "dbconnect-bootstrap.py")
        );
        terminal.show();
        terminal.sendText(
            `${executable} ${bootstrapPath} ${targetResource.fsPath}`
        );
    }
}
