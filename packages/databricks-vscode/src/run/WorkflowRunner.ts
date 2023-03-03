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
import {
    LocalUri,
    SyncDestinationMapper,
} from "../configuration/SyncDestination";
import {CodeSynchronizer} from "../sync/CodeSynchronizer";
import {isNotebook} from "../utils";
import {WorkflowOutputPanel} from "./WorkflowOutputPanel";
import Convert from "ansi-to-html";
import {ConnectionManager} from "../configuration/ConnectionManager";

export class WorkflowRunner implements Disposable {
    private panels = new Map<string, WorkflowOutputPanel>();
    private disposables = new Array<Disposable>();

    constructor(
        private context: ExtensionContext,
        private codeSynchronizer: CodeSynchronizer
    ) {}

    dispose() {
        for (const panel of this.panels.values()) {
            panel.dispose();
        }
        this.disposables.forEach((d) => d.dispose());
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
            this.disposables.push(
                panel.onDidDispose(() => this.panels.delete(key))
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
        connectionManager,
    }: {
        program: Uri;
        parameters?: Record<string, string>;
        args?: Array<string>;
        cluster: Cluster;
        syncDestination: SyncDestinationMapper;
        token?: CancellationToken;
        connectionManager?: ConnectionManager;
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

        panel.onDidReceiveMessage(async (e) => {
            switch (e.command) {
                case "refresh_results":
                    if (
                        e.args?.runId &&
                        connectionManager?.workspaceClient?.apiClient
                    ) {
                        const run = await WorkflowRun.fromId(
                            connectionManager?.workspaceClient?.apiClient,
                            e.args?.runId
                        );

                        if (await isNotebook(program)) {
                            panel.showExportedRun(await run.export());
                        } else {
                            panel.showStdoutResult(
                                (await run.getOutput()).logs || ""
                            );
                        }
                    }
            }
        });
        try {
            if (await isNotebook(program)) {
                panel.showExportedRun(
                    await cluster.runNotebookAndWait({
                        path: syncDestination.localToRemoteNotebook(
                            new LocalUri(program)
                        ).path,
                        parameters,
                        onProgress: (
                            state: jobs.RunLifeCycleState,
                            run: WorkflowRun
                        ) => {
                            panel.updateState(cluster, state, run);
                        },
                        token: cancellation.token,
                    })
                );
            } else {
                const response = await cluster.runPythonAndWait({
                    path: syncDestination.localToRemote(new LocalUri(program))
                        .path,
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
                            ? new Convert().toHtml(e.response.error_trace)
                            : undefined,
                });
                panel.showStdoutResult(e.response.logs || "");
            } else {
                panel.showError({
                    message: (e as any).message,
                });
            }
        }
    }
}
