import {Cluster, WorkflowRun, jobs} from "@databricks/databricks-sdk";
import {basename} from "path";
import {
    CancellationTokenSource,
    Disposable,
    ExtensionContext,
    Uri,
    ViewColumn,
    WebviewPanel,
    window,
} from "vscode";
import {SyncDestination} from "../configuration/SyncDestination";

// TODO: add dispose, add persistence

export async function runNotebookAsWorkflow({
    notebookUri,
    cluster,
    syncDestination,
    context,
}: {
    notebookUri: Uri;
    cluster: Cluster;
    syncDestination: SyncDestination;
    context: ExtensionContext;
}) {
    const panel = new WorkflowOutputPanel(
        window.createWebviewPanel(
            "databricks-notebook-job-run",
            `${basename(notebookUri.path)} - Databricks Job Run`,
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

    try {
        let response = await cluster.runNotebookAndWait({
            path: syncDestination.localToRemoteNotebook(notebookUri),
            onProgress: (state: jobs.RunLifeCycleState, run: WorkflowRun) => {
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
    } catch (e: any) {
        panel.showError(e.message);
    }
}

export class WorkflowOutputPanel {
    constructor(private panel: WebviewPanel, private extensionUri: Uri) {
        panel.webview.html = this.getWebviewContent("Starting ...");
    }

    onDidDispose(listener: () => void): Disposable {
        return this.panel.onDidDispose(listener);
    }

    set html(htmlContent: string) {
        this.panel.webview.html = htmlContent;
    }

    updateState(state: jobs.RunLifeCycleState, run: WorkflowRun) {
        if (state === "INTERNAL_ERROR") {
            // TODO
            this.showError(run.state!.state_message!);
        } else {
            this.panel.webview.postMessage({
                type: "status",
                state,
                pageUrl: run.runPageUrl,
            });
        }
    }

    showError(error: string) {
        this.panel.webview.postMessage({error, type: "error"});
    }

    private getUri(pathList: string[]) {
        return this.panel.webview.asWebviewUri(
            Uri.joinPath(this.extensionUri, ...pathList)
        );
    }

    private getWebviewContent(message: string): string {
        const toolkitUri = this.getUri([
            "out",
            "toolkit.js", // A toolkit.min.js file is also available
        ]);

        // TODO: Display error messages nicer
        /* html */
        return `<html>
            <head>
                <script type="module" src="${toolkitUri}"></script>
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

                            case "error":
                                const pre = document.createElement("pre");
                                pre.innerText = event.data.error;
                                messageEl.appendChild(pre);

                                clearInterval(interval);
                                document.getElementById("duration").innerHTML = "";
    
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
