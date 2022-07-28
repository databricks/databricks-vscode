import {ExtensionContext, Uri, window} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {runNotebookAsWorkflow} from "./WorkflowOutputPanel";

/**
 * workflow related commands
 */
export class WorkflowCommands {
    constructor(
        private connectionManager: ConnectionManager,
        private context: ExtensionContext
    ) {}

    /**
     * Run a Python file or notebook as a workflow on the connected cluster
     */
    runEditorContentsAsWorkflow() {
        return async (resource: Uri) => {
            let targetResource = resource;
            if (!targetResource && window.activeTextEditor) {
                targetResource = window.activeTextEditor.document.uri;
            }

            let cluster = this.connectionManager.cluster;
            let apiClient = this.connectionManager.apiClient;

            if (!cluster || !apiClient) {
                window.showErrorMessage(
                    "You must attach to a cluster to run a workflow"
                );
                return;
            }

            let pathMapper = this.connectionManager.pathMapper;
            if (!pathMapper) {
                window.showErrorMessage(
                    "You must configure code synchronization to run a workflow"
                );
                return;
            }

            await cluster.refresh();
            if (cluster.state !== "RUNNING") {
                // TODO: add option to start cluster
                window.showErrorMessage(
                    `Cluster ${cluster.name} is not running.`
                );
                return;
            }

            if (targetResource) {
                await runNotebookAsWorkflow({
                    notebookUri: targetResource,
                    cluster,
                    pathMapper,
                    context: this.context,
                });
            }
        };
    }
}
