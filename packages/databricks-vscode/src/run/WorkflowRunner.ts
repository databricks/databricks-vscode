import {jobs, ApiError} from "@databricks/databricks-sdk";
import {Cluster, WorkflowRun} from "../sdk-extensions";
import {basename} from "node:path";
import {
    CancellationToken,
    CancellationTokenSource,
    Disposable,
    ExtensionContext,
    Uri,
    ViewColumn,
    window,
} from "vscode";
import {LocalUri, SyncDestinationMapper} from "../sync/SyncDestination";
import {FileUtils} from "../utils";
import {WorkflowOutputPanel} from "./WorkflowOutputPanel";
import Convert from "ansi-to-html";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {WorkspaceFsWorkflowWrapper} from "../workspace-fs/WorkspaceFsWorkflowWrapper";
import {BundleCommands} from "../ui/bundle-resource-explorer/BundleCommands";
import {Events, Telemetry} from "../telemetry";
import {ComputeType, WorkflowTaskType} from "../telemetry/constants";

export class WorkflowRunner implements Disposable {
    private panels = new Map<string, WorkflowOutputPanel>();
    private disposables = new Array<Disposable>();

    constructor(
        private context: ExtensionContext,
        private bundleCommands: BundleCommands,
        private readonly connectionManager: ConnectionManager,
        private readonly telemetry: Telemetry
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
        syncDestinationMapper,
        token,
    }: {
        program: LocalUri;
        parameters?: Record<string, string>;
        args?: Array<string>;
        cluster?: Cluster;
        syncDestinationMapper: SyncDestinationMapper;
        token?: CancellationToken;
    }) {
        const panel = await this.getPanelForUri(program.uri);

        const panelCancellation = new CancellationTokenSource();
        panel.onDidDispose(() => panelCancellation.cancel());

        if (token) {
            token.onCancellationRequested(() => panelCancellation.cancel());
        }

        try {
            await this.bundleCommands.sync();
        } catch (e: unknown) {
            if (e instanceof Error) {
                panel.showError({
                    message: `Can't upload assets to databricks workspace. \nReason: ${e.message}`,
                });
            }
            return;
        }

        if (panelCancellation.token.isCancellationRequested) {
            return;
        }

        if (token?.isCancellationRequested) {
            panel.showError({
                message: "Execution terminated by user.",
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

        let taskType: WorkflowTaskType = "unknown";
        const computeType: ComputeType =
            cluster === undefined ? "serverless" : "cluster";
        const recordRun = this.telemetry.start(Events.WORKFLOW_RUN);
        try {
            const notebookType = await FileUtils.isNotebook(program);
            if (notebookType) {
                taskType = "notebook";
                let remoteFilePath: string =
                    syncDestinationMapper.localToRemoteNotebook(program).path;
                if (syncDestinationMapper.remoteUri.type === "workspace") {
                    const wrappedFile = await new WorkspaceFsWorkflowWrapper(
                        this.connectionManager,
                        this.context
                    ).createNotebookWrapper(
                        program,
                        syncDestinationMapper.localToRemote(program),
                        syncDestinationMapper.remoteUri,
                        notebookType
                    );
                    remoteFilePath = wrappedFile
                        ? wrappedFile.path
                        : remoteFilePath;
                }
                panel.showExportedRun(
                    await WorkflowRun.runNotebookAndWait({
                        client: this.connectionManager.workspaceClient!
                            .apiClient,
                        path: remoteFilePath,
                        clusterId: cluster?.id,
                        parameters,
                        onProgress: (
                            state: jobs.RunLifeCycleState,
                            run: WorkflowRun
                        ) => {
                            panel.updateState(cluster, state, run);
                        },
                        token: panelCancellation.token,
                    })
                );
                recordRun({success: true, taskType, computeType});
            } else {
                taskType = "python";
                const originalFileUri =
                    syncDestinationMapper.localToRemote(program);
                const wrappedFile =
                    syncDestinationMapper.remoteUri.type === "workspace"
                        ? await new WorkspaceFsWorkflowWrapper(
                              this.connectionManager,
                              this.context
                          ).createPythonFileWrapper(
                              originalFileUri,
                              syncDestinationMapper.remoteUri
                          )
                        : undefined;
                const response = await WorkflowRun.runPythonAndWait({
                    client: this.connectionManager.workspaceClient!.apiClient,
                    clusterId: cluster?.id,
                    path: wrappedFile ? wrappedFile.path : originalFileUri.path,
                    args: args ?? [],
                    onProgress: (
                        state: jobs.RunLifeCycleState,
                        run: WorkflowRun
                    ) => {
                        panel.updateState(cluster, state, run);
                    },
                    token: panelCancellation.token,
                });
                //TODO: Respone logs will contain bootstrap code path in the error stack trace. Remove it.
                panel.showStdoutResult(response.logs || "");
                recordRun({success: true, taskType, computeType});
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
            recordRun({success: false, taskType, computeType});
        }
    }
}
