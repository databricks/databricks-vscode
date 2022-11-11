import {
    Cluster,
    WorkflowRun,
    jobs,
    ApiClientResponseError,
} from "@databricks/databricks-sdk";
import {basename} from "node:path";
import {
    CancellationToken,
    CancellationTokenSource,
    commands,
    Disposable,
    ExtensionContext,
    Uri,
    ViewColumn,
    window,
} from "vscode";
import {SyncDestination} from "../configuration/SyncDestination";
import {CodeSynchronizer} from "../sync/CodeSynchronizer";
import {isNotebook} from "../utils";
import {WorkflowOutputPanel} from "./WorkflowOutputPanel";

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
        const key = uri.toString();
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

        if (this.codeSynchronizer.state === "STOPPED") {
            await commands.executeCommand("databricks.sync.start");
        }

        // We wait for sync to complete so that the local files are consistant
        // with the remote repo files
        await this.codeSynchronizer.waitForSyncComplete();

        try {
            if (await isNotebook(program)) {
                const response = await cluster.runNotebookAndWait({
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
                const htmlContent = response.views![0].content;
                panel.showHtmlResult(htmlContent || "");
            } else {
                const response = await cluster.runPythonAndWait({
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
