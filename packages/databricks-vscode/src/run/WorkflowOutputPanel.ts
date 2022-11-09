import {Cluster, WorkflowRun, jobs} from "@databricks/databricks-sdk";
import * as fs from "node:fs/promises";
import {Disposable, Uri, WebviewPanel} from "vscode";

export class WorkflowOutputPanel {
    constructor(
        private panel: WebviewPanel,
        private readonly webviewContent: string
    ) {
        this.reset();
    }

    static async create(
        panel: WebviewPanel,
        extensionUri: Uri
    ): Promise<WorkflowOutputPanel> {
        const webviewContent = await WorkflowOutputPanel.getWebviewContent(
            panel,
            extensionUri
        );

        return new WorkflowOutputPanel(panel, webviewContent);
    }

    reset() {
        this.panel.webview.html =
            this.webviewContent + `<!-- ${Date.now()} -->`;
    }

    focus() {
        this.panel.reveal();
    }

    onDidDispose(listener: () => void): Disposable {
        return this.panel.onDidDispose(listener);
    }

    dispose() {
        this.panel.dispose();
    }

    set html(htmlContent: string) {
        this.panel.webview.html = htmlContent;
    }

    showHtmlResult(htmlContent: string) {
        this.panel.webview.postMessage({
            fn: "setOutputHtml",
            args: [htmlContent],
        });
    }

    showStdoutResult(output: string) {
        this.panel.webview.postMessage({
            fn: "setStdout",
            args: [output],
        });
    }

    showError({message, stack}: {message?: string; stack?: string}) {
        this.panel.webview.postMessage({
            fn: "setError",
            args: [message, stack],
        });
    }

    async updateState(
        cluster: Cluster,
        state: jobs.RunLifeCycleState,
        run: WorkflowRun
    ) {
        this.panel.webview.postMessage({
            type: "status",
            state,
            pageUrl: run.runPageUrl,
        });

        const task = run.tasks![0];
        const taskCluster = task.cluster_instance;

        let clusterUrl = "#";
        if (taskCluster) {
            clusterUrl = await cluster.getSparkUiUrl(
                taskCluster.spark_context_id
            );
        }

        this.panel.webview.postMessage({
            fn: "updateDetails",
            args: [
                {
                    runUrl: run.runPageUrl,
                    runId: task.run_id,
                    clusterUrl,
                    clusterId: taskCluster?.cluster_id || "-",
                    started: task.start_time
                        ? new Date(task.start_time).toLocaleString()
                        : "-",
                    ended: task.end_time
                        ? new Date(task.end_time).toLocaleString()
                        : "-",
                    duration: task.start_time
                        ? Date.now() - task.start_time
                        : -1,
                    status: state,
                },
            ],
        });
    }

    private static getToolkitUri(panel: WebviewPanel, extensionUri: Uri): Uri {
        return panel.webview.asWebviewUri(
            Uri.joinPath(
                extensionUri,
                "out",
                "toolkit.js" // A toolkit.min.js file is also available
            )
        );
    }

    private static async getWebviewContent(
        panel: WebviewPanel,
        extensionUri: Uri
    ): Promise<string> {
        const htmlFile = Uri.joinPath(extensionUri, "webview-ui", "job.html");
        let html = await fs.readFile(htmlFile.fsPath, "utf8");
        html = html.replace(
            /src="[^"].*?\/toolkit.js"/g,
            `src="${WorkflowOutputPanel.getToolkitUri(panel, extensionUri)}"`
        );

        return html;
    }
}
