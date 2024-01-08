import {jobs, ApiError} from "@databricks/databricks-sdk";
import {Cluster, WorkflowRun} from "../sdk-extensions";
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
import {LocalUri, SyncDestinationMapper} from "../sync/SyncDestination";
import {CodeSynchronizer} from "../sync/CodeSynchronizer";
import {FileUtils} from "../utils";
import {WorkflowOutputPanel} from "./WorkflowOutputPanel";
import Convert from "ansi-to-html";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {WorkspaceFsWorkflowWrapper} from "../workspace-fs/WorkspaceFsWorkflowWrapper";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";

export class WorkflowRunner implements Disposable {
    private panels = new Map<string, WorkflowOutputPanel>();
    private disposables = new Array<Disposable>();

    constructor(
        private context: ExtensionContext,
        private codeSynchronizer: CodeSynchronizer,
        private readonly connectionManager: ConnectionManager
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
    }: {
        program: LocalUri;
        parameters?: Record<string, string>;
        args?: Array<string>;
        cluster: Cluster;
        syncDestination: SyncDestinationMapper;
        token?: CancellationToken;
    }) {
        const panel = await this.getPanelForUri(program.uri);

        const cancellation = new CancellationTokenSource();
        panel.onDidDispose(() => cancellation.cancel());

        if (token) {
            token.onCancellationRequested(() => {
                cancellation.cancel();
            });
        }

        if (
            !["IN_PROGRESS", "WATCHING_FOR_CHANGES"].includes(
                this.codeSynchronizer.state
            )
        ) {
            await commands.executeCommand("databricks.sync.start");
        }

        // We wait for sync to complete so that the local files are consistant
        // with the remote repo files
        await Promise.race([
            this.codeSynchronizer.waitForSyncComplete(),
            new Promise<undefined>(
                (resolve) =>
                    token?.onCancellationRequested(() => resolve(undefined))
            ),
        ]);
        if (token?.isCancellationRequested) {
            panel.showError({
                message: "Execution terminated by user.",
            });
            this.codeSynchronizer.stop();
            return;
        }
        if (this.codeSynchronizer.state !== "WATCHING_FOR_CHANGES") {
            panel.showError({
                message: `Can't sync ${program}. \nReason: ${
                    this.codeSynchronizer.reason ?? this.codeSynchronizer.state
                }`,
            });
            return;
        }

        panel.onDidReceiveMessage(async (e) => {
            switch (e.command) {
                case "refresh_results":
                    if (
                        e.args?.runId &&
                        this.connectionManager.workspaceClient?.apiClient
                    ) {
                        const run = await WorkflowRun.fromId(
                            this.connectionManager.workspaceClient?.apiClient,
                            e.args?.runId
                        );

                        if (await FileUtils.isNotebook(program)) {
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
            const notebookType = await FileUtils.isNotebook(program);
            if (notebookType) {
                let remoteFilePath: string =
                    syncDestination.localToRemoteNotebook(program).path;
                if (
                    workspaceConfigs.enableFilesInWorkspace &&
                    syncDestination.remoteUri.type === "workspace"
                ) {
                    const wrappedFile = await new WorkspaceFsWorkflowWrapper(
                        this.connectionManager,
                        this.context
                    ).createNotebookWrapper(
                        program,
                        syncDestination.localToRemote(program),
                        syncDestination.remoteUri,
                        notebookType
                    );
                    remoteFilePath = wrappedFile
                        ? wrappedFile.path
                        : remoteFilePath;
                }
                panel.showExportedRun(
                    await cluster.runNotebookAndWait({
                        path: remoteFilePath,
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
                const originalFileUri = syncDestination.localToRemote(program);
                const wrappedFile =
                    workspaceConfigs.enableFilesInWorkspace &&
                    syncDestination.remoteUri.type === "workspace"
                        ? await new WorkspaceFsWorkflowWrapper(
                              this.connectionManager,
                              this.context
                          ).createPythonFileWrapper(
                              originalFileUri,
                              syncDestination.remoteUri
                          )
                        : undefined;
                const response = await cluster.runPythonAndWait({
                    path: wrappedFile ? wrappedFile.path : originalFileUri.path,
                    args: args ?? [],
                    onProgress: (
                        state: jobs.RunLifeCycleState,
                        run: WorkflowRun
                    ) => {
                        panel.updateState(cluster, state, run);
                    },
                    token: cancellation.token,
                });
                //TODO: Respone logs will contain bootstrap code path in the error stack trace. Remove it.
                panel.showStdoutResult(response.logs || "");
            }
        } catch (e: unknown) {
            if (e instanceof ApiError) {
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
