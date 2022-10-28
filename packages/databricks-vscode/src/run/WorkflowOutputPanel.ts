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

// TODO: add dispose, add persistence, reuse panel

export async function runAsWorkflow({
    program,
    parameters = {},
    args = [],
    cluster,
    syncDestination,
    codeSynchronizer,
    context,
    token,
}: {
    program: Uri;
    parameters?: Record<string, string>;
    args?: Array<string>;
    cluster: Cluster;
    syncDestination: SyncDestination;
    codeSynchronizer: CodeSynchronizer;
    context: ExtensionContext;
    token?: CancellationToken;
}) {
    const panel = new WorkflowOutputPanel(
        window.createWebviewPanel(
            "databricks-notebook-job-run",
            `${basename(program.path)} - Databricks Job Run`,
            ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        ),
        context.extensionUri
    );

    const cancellation = new CancellationTokenSource();
    panel.onDidDispose(() => cancellation.cancel());

    if (token) {
        token.onCancellationRequested(() => {
            cancellation.cancel();
        });
    }

    // We wait for sync to complete so that the local files are consistant
    // with the remote repo files
    await codeSynchronizer.waitForSyncComplete();

    try {
        if (await isNotebook(program)) {
            let response = await cluster.runNotebookAndWait({
                path: syncDestination.localToRemoteNotebook(program),
                parameters,
                onProgress: (
                    state: jobs.RunLifeCycleState,
                    run: WorkflowRun
                ) => {
                    panel.updateState(state, run);
                },
                token: cancellation.token,
            });
            let htmlContent = response.views![0].content;
            panel.showHtmlResult(htmlContent || "");
        } else {
            let response = await cluster.runPythonAndWait({
                path: syncDestination.localToRemoteNotebook(program) + ".py",
                args,
                onProgress: (
                    state: jobs.RunLifeCycleState,
                    run: WorkflowRun
                ) => {
                    panel.updateState(state, run);
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

export class WorkflowOutputPanel {
    private run?: WorkflowRun;
    constructor(private panel: WebviewPanel, private extensionUri: Uri) {
        this.getWebviewContent().then((html) => {
            panel.webview.html = html;
        });
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

    updateState(state: jobs.RunLifeCycleState, run: WorkflowRun) {
        this.run = run;
        this.panel.webview.postMessage({
            type: "status",
            state,
            pageUrl: run.runPageUrl,
        });

        const task = run.tasks![0];
        const cluster = task.cluster_instance;

        let clusterUrl = "#";
        if (cluster) {
            clusterUrl = `https://${
                new URL(run.runPageUrl).hostname
            }/#setting/sparkui/${cluster.cluster_id}/driver-${
                cluster.spark_context_id
            }`;
        }

        this.panel.webview.postMessage({
            fn: "updateDetails",
            args: [
                {
                    runUrl: run.runPageUrl,
                    runId: task.run_id,
                    clusterUrl,
                    clusterId: cluster?.cluster_id || "-",
                    started: task.start_time
                        ? new Date(task.start_time).toLocaleString()
                        : "-",
                    ended: task.end_time
                        ? new Date(task.end_time).toLocaleString()
                        : "-",
                    status: state,
                },
            ],
        });
        if (task.end_time) {
            this.panel.webview.postMessage({
                fn: "stop",
                args: [],
            });
        }
    }

    getToolkitUri(): Uri {
        return this.panel.webview.asWebviewUri(
            Uri.joinPath(
                this.extensionUri,
                "out",
                "toolkit.js" // A toolkit.min.js file is also available
            )
        );
    }

    private async getWebviewContent(): Promise<string> {
        const htmlFile = Uri.joinPath(
            this.extensionUri,
            "webview-ui",
            "job.html"
        );
        let html = await fs.readFile(htmlFile.fsPath, "utf8");
        html = html
            .replace(/\/\*\* STRIP -> \*\*\/(.*?)\/\*\* <- STRIP \*\*\//gs, "")
            .replace(
                /src="[^"].*?\/toolkit.js"/g,
                `src="${this.getToolkitUri()}"`
            );

        return html;
    }
}
