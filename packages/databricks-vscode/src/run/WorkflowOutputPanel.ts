import {
    Cluster,
    WorkflowRun,
    jobs,
    ApiClientResponseError,
} from "@databricks/databricks-sdk";
import {basename} from "node:path";
import * as fs from "node:fs/promises";
import {
    CancellationToken,
    CancellationTokenSource,
    Disposable,
    ExtensionContext,
    Uri,
    ViewColumn,
    WebviewPanel,
    window,
} from "vscode";
import {SyncDestination} from "../configuration/SyncDestination";
import {CodeSynchronizer} from "../sync/CodeSynchronizer";
import {isNotebook} from "../utils";

export class WorkflowRunner implements Disposable {
    private panels = new Map<string, WorkflowOutputPanel>();

    constructor(
        private context: ExtensionContext,
        private codeSynchronizer: CodeSynchronizer
    ) {}

    dispose() {
        for (const panel of this.panels.values()) {
            panel.dispose();
        }
    }

    private async getPanelForUri(uri: Uri) {
        let key = uri.toString();
        let panel = this.panels.get(key);

        if (panel) {
            panel.focus();
            panel.reset();
        } else {
            panel = await WorkflowOutputPanel.create(
                window.createWebviewPanel(
                    "databricks-notebook-job-run",
                    `${basename(uri.path)} - Databricks Job Run`,
                    ViewColumn.Two,
                    {
                        enableScripts: true,
                        retainContextWhenHidden: true,
                    }
                ),
                this.context.extensionUri
            );
            this.panels.set(key, panel);
        }

        return panel;
    }

    async run({
        program,
        parameters = {},
        args = [],
        cluster,
        syncDestination,
        token,
    }: {
        program: Uri;
        parameters?: Record<string, string>;
        args?: Array<string>;
        cluster: Cluster;
        syncDestination: SyncDestination;
        token?: CancellationToken;
    }) {
        const panel = await this.getPanelForUri(program);

        const cancellation = new CancellationTokenSource();
        panel.onDidDispose(() => cancellation.cancel());

        if (token) {
            token.onCancellationRequested(() => {
                cancellation.cancel();
            });
        }

        // We wait for sync to complete so that the local files are consistant
        // with the remote repo files
        await this.codeSynchronizer.waitForSyncComplete();

        try {
            if (await isNotebook(program)) {
                let response = await cluster.runNotebookAndWait({
                    path: syncDestination.localToRemoteNotebook(program),
                    parameters,
                    onProgress: (
                        state: jobs.RunLifeCycleState,
                        run: WorkflowRun
                    ) => {
                        panel.updateState(cluster, state, run);
                    },
                    token: cancellation.token,
                });
                let htmlContent = response.views![0].content;
                panel.showHtmlResult(htmlContent || "");
            } else {
                let response = await cluster.runPythonAndWait({
                    path:
                        syncDestination.localToRemoteNotebook(program) + ".py",
                    args,
                    onProgress: (
                        state: jobs.RunLifeCycleState,
                        run: WorkflowRun
                    ) => {
                        panel.updateState(cluster, state, run);
                    },
                    token: cancellation.token,
                });
                panel.showStdoutResult(response.logs || "");
            }
        } catch (e: unknown) {
            if (e instanceof ApiClientResponseError) {
                panel.showError({
                    message: e.message,
                    stack:
                        "error_trace" in e.response
                            ? e.response.error_trace
                            : undefined,
                });
            } else {
                panel.showError({
                    message: (e as any).message,
                });
            }
        }
    }
}

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
        let webviewContent = await WorkflowOutputPanel.getWebviewContent(
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
