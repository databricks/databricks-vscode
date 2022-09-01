import {Cluster, WorkflowRun, jobs} from "@databricks/databricks-sdk";
import {TextDecoder} from "node:util";
import {basename} from "path";
import {
    CancellationToken,
    CancellationTokenSource,
    Disposable,
    ExtensionContext,
    Uri,
    ViewColumn,
    WebviewPanel,
    window,
    workspace,
} from "vscode";
import {SyncDestination} from "../configuration/SyncDestination";

// TODO: add dispose, add persistence, reuse panel

export async function runAsWorkflow({
    program,
    parameters = {},
    cluster,
    syncDestination,
    context,
    token,
}: {
    program: Uri;
    parameters?: Record<string, string>;
    cluster: Cluster;
    syncDestination: SyncDestination;
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
            // window.parent doesn't exist in a Webview
            htmlContent = htmlContent?.replace(
                "<script>window.__STATIC_SETTINGS__",
                "<script>window.parent = { postMessage: function() {}}; window.__STATIC_SETTINGS__"
            );
            panel.html = htmlContent || "";
        } else {
            let response = await cluster.runPythonAndWait({
                path: syncDestination.localToRemoteNotebook(program) + ".py",
                onProgress: (
                    state: jobs.RunLifeCycleState,
                    run: WorkflowRun
                ) => {
                    console.log("progress", state, run);
                    panel.updateState(state, run);
                },
                token: cancellation.token,
            });
            panel.showStdoutResult(response.logs || "");
        }
    } catch (e: any) {
        panel.showError(e.message);
    }
}

async function isNotebook(uri: Uri): Promise<boolean> {
    let bytes = await workspace.fs.readFile(uri);
    const lines = new TextDecoder().decode(bytes).split(/\r?\n/);
    return (
        lines.length > 0 && lines[0].startsWith("# Databricks notebook source")
    );
}

export class WorkflowOutputPanel {
    constructor(private panel: WebviewPanel, private extensionUri: Uri) {
        panel.webview.html = this.getWebviewContent("Starting ...");
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

    showStdoutResult(output: string) {
        /* html */
        this.html = `<html>
            <head>
                <script type="module" src="${this.getToolkitUri()}"></script>
            <body>
                <h1>Output</h1>
                <hr>
                <pre>${output}</pre>
            </body>
        </html>`;
    }

    showError(error: string) {
        /* html */
        this.html = `<html>
            <head>
                <script type="module" src="${this.getToolkitUri()}"></script>
                <style>
                    .alert-error {
                        padding: 8px;
                        color: rgb(200, 45, 76);
                        border-color: rgb(251, 208, 216);
                        background-color: #FFF5F7;
                        border: 1px solid #FBD0D8;
                        border-radius: 4px;
                        overflow: scroll;
                    }
                </style>
            </head>
            <body>
                <h1>Error</h1><hr>
                <pre class="alert-error">${error}</pre>
            </body>
        </html>`;
    }

    updateState(state: jobs.RunLifeCycleState, run: WorkflowRun) {
        this.panel.webview.postMessage({
            type: "status",
            state,
            pageUrl: run.runPageUrl,
        });
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

    private getWebviewContent(message: string): string {
        /* html */
        return `<html>
            <head>
                <script type="module" src="${this.getToolkitUri()}"></script>
            </head>
            <body>
                <div style="margin:20px; display: flex; justify-content: center; width: 100%"><vscode-progress-ring></vscode-progress-ring></div>
                <div style="display: flex; justify-content: center; width: 100%"><span id="message">${message}</span> <span id="duration"></span></div>
    
                <script>
                    window.addEventListener('message', event => {
                        const messageEl = document.getElementById("message")
                        messageEl.innerHTML = "";

                        switch(event.data.type) {
                            case "status":
                                const message = 'State: ' + event.data.state + ' - <vscode-link href="' + event.data.pageUrl + '">View job on Databricks</vscode-link>';
                                messageEl.innerHTML = message;
                                break;

                            default:
                                messageEl.innerText = event.data.message;
                                break;
                        }
                    });
    
                    let start = Date.now();
                    let interval = setInterval(function() {
                        document.getElementById("duration").innerText = "(" + Math.floor((Date.now()-start) / 1000) + "s)";
                    }, 300);
                </script>
            </body>
        </html>`;
    }
}
