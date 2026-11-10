import { readFile } from "node:fs/promises";
import {
    JobsClient,
    type GetRunResponse,
    type RunTaskSettings,
    type SubmitRunRequest,
} from "@databricks/sdk-jobs/v2";
import { WorkspaceFilesClient } from "@databricks/sdk-workspacefiles/v1";
import Convert from "ansi-to-html";
import {
    localToRemote,
    localToRemoteNotebook,
    workspacePath,
    type SyncDestination,
} from "../../kernel/bundle/SyncDestination";
import { calls } from "../../kernel/connection/ApiClients";
import type { Connection } from "../../kernel/connection/ConnectionService";
import { CancelledError, errorMessage, isCancellation } from "../../platform/errors";
import { sleep } from "../../platform/timers";
import { notebookType } from "./notebooks";
import type { RunContext } from "./RunContext";
import type { ComputeType, WorkflowTaskType } from "./telemetry";
import { runDetails, type WorkflowOutputPanel } from "./WorkflowOutputPanel";
import { notebookWrapper, pythonFileWrapper, type Wrapper } from "./workflowWrappers";

/* eslint-disable @typescript-eslint/naming-convention */

/** What a `databricks-workflow` launch configuration runs (RUN-03). */
export interface WorkflowRequest {
    /** An absolute local path. */
    readonly program: string;
    /** A notebook's widget values. */
    readonly parameters?: Readonly<Record<string, string>>;
    /** A Python file's `sys.argv`. */
    readonly args?: readonly string[];
}

/** The old `workflowRun` event's properties. */
export interface WorkflowRunRecord {
    readonly success: boolean;
    readonly taskType: WorkflowTaskType;
    readonly computeType: ComputeType;
}

export interface WorkflowRunnerDeps {
    readonly ctx: RunContext;
    /** The panel for this file: an open one is reset and revealed, else one is created. */
    readonly panelFor: (program: string) => Promise<WorkflowOutputPanel>;
    /** Starts the `workflowRun` clock; the returned function records it. */
    readonly startRecord: () => (record: WorkflowRunRecord) => void;
    /** How often the run is read; 3 seconds, as before. */
    readonly pollIntervalMs?: number;
}

const TASK_KEY = "js_sdk_job_run";
const ENVIRONMENT_KEY = "js_sdk_job_run_environment";
/** Where the run can't go further. */
const TERMINAL = ["TERMINATED", "SKIPPED", "INTERNAL_ERROR"];

/** The one-time run that runs a notebook (RUN-02): on the cluster, or serverless without one. Golden-tested. */
export function notebookSubmission(
    notebookPath: string,
    parameters: Readonly<Record<string, string>>,
    clusterId: string | undefined,
): SubmitRunRequest {
    const task: RunTaskSettings = {
        taskKey: TASK_KEY,
        task: {
            $case: "notebookTask",
            notebookTask: { notebookPath, baseParameters: { ...parameters } },
        },
        dependsOn: [],
        libraries: [],
        ...(clusterId !== undefined
            ? { spec: { $case: "existingClusterId", existingClusterId: clusterId } }
            : {}),
    };
    return { tasks: [task] };
}

/** The one-time run that runs a Python file; serverless, it gets an environment, as before. */
export function pythonSubmission(
    pythonFile: string,
    args: readonly string[],
    clusterId: string | undefined,
): SubmitRunRequest {
    const task: RunTaskSettings = {
        taskKey: TASK_KEY,
        task: { $case: "sparkPythonTask", sparkPythonTask: { pythonFile, parameters: [...args] } },
        ...(clusterId !== undefined
            ? { spec: { $case: "existingClusterId", existingClusterId: clusterId } }
            : { environmentRef: { $case: "environmentKey", environmentKey: ENVIRONMENT_KEY } }),
    };
    return {
        tasks: [task],
        ...(clusterId === undefined
            ? { environments: [{ environmentKey: ENVIRONMENT_KEY, spec: { client: "1" } }] }
            : {}),
    };
}

/** Where a workflow runs: a running cluster, or serverless. */
type WorkflowCompute =
    | { readonly kind: "cluster"; readonly clusterId: string }
    /** `defaulted`: nothing was chosen, so serverless is the default; a failed run then says how to pick a cluster. */
    | { readonly kind: "serverless"; readonly defaulted?: boolean };

const SERVERLESS_DEFAULT_HINT =
    "Serverless compute is the default when no compute is chosen. If this workspace doesn't offer serverless compute, choose a cluster in the Compute view.";

/**
 * The message with the default's hint, for a run on the default whose message is about
 * serverless compute. A cluster run's refusal, or an unrelated failure, gets no hint.
 */
function withDefaultHint(message: string, defaulted: boolean): string {
    return defaulted && /serverless/i.test(message)
        ? `${message}\n${SERVERLESS_DEFAULT_HINT}`
        : message;
}

/**
 * "Run File as Workflow" (RUN-02): uploads the bundle's files, writes a
 * wrapper next to the remote file, submits a one-time run of it, follows
 * the run in the "Databricks Job Run" panel, and shows the exported
 * notebook or the logs. Ported from the old `WorkflowRunner`, the checks of
 * `DatabricksWorkflowDebugAdapter.startWorkflow`, and `WorkflowRun`, on
 * `@databricks/sdk-jobs`; the wrappers go through `@databricks/sdk-workspacefiles`.
 */
export class WorkflowRunner {
    private readonly pollIntervalMs: number;

    constructor(private readonly deps: WorkflowRunnerDeps) {
        this.pollIntervalMs = deps.pollIntervalMs ?? 3000;
    }

    /** Resolves once the run is shown, or the run stopped at a check; the message is the error to show then. */
    async run(
        request: WorkflowRequest,
        signal: AbortSignal,
    ): Promise<{ readonly ok: boolean; readonly error?: string }> {
        const { ctx } = this.deps;
        const { program } = request;
        const type = await notebookType(program).catch(() => undefined);
        if (type === undefined && !program.endsWith(".py")) {
            return { ok: false, error: "Only Python files can be run as a workflow" };
        }
        let connection: Connection;
        let destination: SyncDestination;
        let compute: WorkflowCompute;
        try {
            connection = await ctx.connection(signal);
            const target = await ctx.target(signal);
            if (target.mode !== "development") {
                ctx.prompts.changeTargetMode(target.mode);
                return { ok: false };
            }
            if (target.destination === undefined) {
                return {
                    ok: false,
                    error: "No sync destination found. Maybe the databricks.yml is misconfgured.",
                };
            }
            destination = target.destination;
            const effective = ctx.compute();
            if (effective?.kind === "serverless") {
                compute = { kind: "serverless", defaulted: effective.source === "default" };
            } else if (effective?.kind === "cluster") {
                const cluster = await ctx.getCluster(effective.clusterId, signal);
                if (!["RUNNING", "RESIZING"].includes(cluster.state)) {
                    ctx.prompts.startCluster();
                    return { ok: false };
                }
                compute = { kind: "cluster", clusterId: cluster.id };
            } else {
                ctx.prompts.attachCluster();
                return { ok: false };
            }
        } catch (e) {
            return isCancellation(e) ? { ok: false } : { ok: false, error: errorMessage(e) };
        }

        const panel = await this.deps.panelFor(program);
        const controller = new AbortController();
        const closed = panel.onDidDispose(() => controller.abort());
        const runSignal = AbortSignal.any([signal, controller.signal]);
        try {
            await this.execute({
                program,
                request,
                type,
                connection,
                destination,
                compute,
                panel,
                signal: runSignal,
            });
            return { ok: true };
        } finally {
            closed.dispose();
        }
    }

    private async execute(run: {
        program: string;
        request: WorkflowRequest;
        type: Awaited<ReturnType<typeof notebookType>>;
        connection: Connection;
        destination: SyncDestination;
        compute: WorkflowCompute;
        panel: WorkflowOutputPanel;
        signal: AbortSignal;
    }) {
        const { ctx } = this.deps;
        const { program, request, type, connection, destination, compute, panel, signal } = run;
        try {
            // As before, the notification and its Cancel last as long as the upload; the panel follows the run.
            await ctx.progress(signal, (uploadSignal) => ctx.upload(uploadSignal));
        } catch (e) {
            if (panel.visible) {
                panel.showError(
                    signal.aborted
                        ? "Execution terminated by user."
                        : `Can't upload assets to databricks workspace. \nReason: ${errorMessage(e)}`,
                );
            }
            return;
        }

        const jobs = connection.api.get(JobsClient);
        const clusterId = compute.kind === "cluster" ? compute.clusterId : undefined;
        panel.onRefreshResults((runId) => {
            if (runId === undefined) {
                return;
            }
            void this.showResult(jobs, BigInt(runId), type !== undefined, panel, {
                defaulted: compute.kind === "serverless" && compute.defaulted === true,
            }).catch((e: unknown) => this.showFailure(panel, e));
        });

        const taskType: WorkflowTaskType = type !== undefined ? "notebook" : "python";
        const record = this.deps.startRecord();
        const computeType: ComputeType = compute.kind;
        try {
            const target = {
                sourceFile: workspacePath(localToRemote(program, destination)),
                projectRoot: workspacePath(destination.remoteRoot),
            };
            const remoteFile = localToRemote(program, destination);
            let submission: SubmitRunRequest;
            if (type !== undefined) {
                const wrapper = notebookWrapper(
                    type,
                    await readFile(program, "utf-8"),
                    await ctx.readResource("notebook.workflow-wrapper.py"),
                    remoteFile,
                    target,
                    ctx.rearrangeCells(),
                );
                const notebookPath =
                    wrapper === undefined
                        ? localToRemoteNotebook(program, destination)
                        : await this.upload(connection, wrapper, signal);
                submission = notebookSubmission(notebookPath, request.parameters ?? {}, clusterId);
            } else {
                const wrapper = pythonFileWrapper(
                    await ctx.readResource("file.workflow-wrapper.py"),
                    remoteFile,
                    target,
                );
                submission = pythonSubmission(
                    await this.upload(connection, wrapper, signal),
                    request.args ?? [],
                    clusterId,
                );
            }

            const submitted = await jobs.submitRun(submission, calls.write({ signal }));
            const finished = await this.waitForRun(jobs, submitted.runId, signal, (state) =>
                panel.updateDetails(runDetails(state, connection.host, clusterId)),
            );
            const taskRunId = finished.tasks?.[0]?.runId;
            if (taskRunId === undefined) {
                // The run's own reason, when it gave one: that's what the user needs to read.
                throw new Error(finished.state?.stateMessage || "Run has no tasks");
            }
            await this.showResult(jobs, taskRunId, type !== undefined, panel, {
                signal,
                defaulted: compute.kind === "serverless" && compute.defaulted === true,
            });
            record({ success: true, taskType, computeType });
        } catch (e) {
            record({ success: false, taskType, computeType });
            if (!panel.visible) {
                return;
            }
            if (isCancellation(e) || signal.aborted) {
                panel.showError("Execution terminated by user.");
                return;
            }
            this.showFailure(panel, e, compute.kind === "serverless" && compute.defaulted === true);
        }
    }

    /** Imports the wrapper, replacing an older one; resolves with what the job runs. */
    private async upload(
        connection: Connection,
        wrapper: Wrapper,
        signal: AbortSignal,
    ): Promise<string> {
        await connection.api.get(WorkspaceFilesClient).import(
            {
                path: wrapper.path,
                content: Buffer.from(wrapper.content),
                format: "AUTO",
                overwrite: true,
            },
            calls.write({ signal }),
        );
        return wrapper.runPath;
    }

    /** Reads the run until it ends, every 3 seconds; aborting cancels it. */
    private async waitForRun(
        jobs: JobsClient,
        runId: bigint,
        signal: AbortSignal,
        onProgress: (run: GetRunResponse) => void,
    ): Promise<GetRunResponse> {
        try {
            for (;;) {
                const run = await jobs.getRun({ runId }, calls.read({ signal }));
                onProgress(run);
                if (TERMINAL.includes(run.state?.lifeCycleState ?? "INTERNAL_ERROR")) {
                    return run;
                }
                await sleep(this.pollIntervalMs, signal);
            }
        } catch (e) {
            if (signal.aborted) {
                // As before: stopping the session or closing the panel cancels the run.
                await jobs
                    .cancelRun({ runId }, calls.write())
                    .catch((error: unknown) =>
                        this.deps.ctx.log.warn("Can't cancel the run", error),
                    );
                throw new CancelledError();
            }
            throw e;
        }
    }

    /** A notebook's exported HTML; a Python file's logs, and its error when it failed. */
    private async showResult(
        jobs: JobsClient,
        taskRunId: bigint,
        notebook: boolean,
        panel: WorkflowOutputPanel,
        options: { readonly signal?: AbortSignal; readonly defaulted: boolean },
    ) {
        const signal = options.signal;
        if (notebook) {
            const exported = await jobs.exportRun({ runId: taskRunId }, calls.read({ signal }));
            panel.showExportedRun(exported.views?.[0]?.content ?? "");
            return;
        }
        const output = await jobs.getRunOutput({ runId: taskRunId }, calls.read({ signal }));
        if (output.error !== undefined && output.error !== "") {
            panel.showError(
                withDefaultHint(output.error, options.defaulted),
                output.errorTrace
                    ? new Convert({ escapeXML: true }).toHtml(output.errorTrace)
                    : undefined,
            );
        }
        panel.showStdout(output.logs ?? "");
    }

    private showFailure(panel: WorkflowOutputPanel, e: unknown, defaulted = false) {
        this.deps.ctx.log.error("Error while running the workflow", e);
        if (panel.visible) {
            const message = e instanceof Error ? e.message : "An unknown error occurred.";
            panel.showError(withDefaultHint(message, defaulted));
        }
    }
}
