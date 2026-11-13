import { window } from "vscode";
import type { OperationTarget } from "../../../kernel/bundle/BundleOperations";
import { syncDestination, type SyncDestination } from "../../../kernel/bundle/SyncDestination";
import { CliError } from "../../../kernel/cli/Cli";
import {
    MissingVariableError,
    runArgs,
    type BundleRunOptions,
} from "../../../kernel/cli/commands/bundle";
import type { PipelineEvent } from "../../../kernel/connection";
import type { Kernel } from "../../../kernel/feature";
import type { TelemetryRecorder } from "../../../kernel/telemetry";
import { errorMessage, isCancellation, UserFacingError } from "../../../platform/errors";
import type { Logger } from "../../../platform/log";
import { deploy, requireTarget } from "../BundleCommands";
import { bundleCommandError } from "../BundleExplorerCommands";
import { BUNDLE_RUN, type BundleRunType } from "../telemetry";
import { JobRunTracker } from "./JobRunTracker";
import type { PipelineDatasets } from "./pipelineDatasets";
import type { PipelineDiagnostics } from "./PipelineDiagnostics";
import { PipelineRunTracker } from "./PipelineRunTracker";
import type { TrackerOptions } from "./RunTracker";
import { quoteCommandLine, type RunTerminals } from "./RunTerminal";
import type { RunTrackers } from "./RunTrackers";
import { showTableSelectionQuickPick } from "./tableSelection";

export const DEPLOY_AND_RUN_JOB = "databricks.bundle.deployAndRunJob";
export const DEPLOY_AND_RUN_PIPELINE = "databricks.bundle.deployAndRunPipeline";
export const DEPLOY_AND_VALIDATE_PIPELINE = "databricks.bundle.deployAndValidatePipeline";
export const DEPLOY_AND_RUN_SELECTED_TABLES = "databricks.bundle.deployAndRunSelectedTables";
export const DEPLOY_AND_RUN_FROM_INPUT = "databricks.bundle.deployAndRunFromInput";
export const CANCEL_RUN = "databricks.bundle.cancelRun";
export const CLEAR_PIPELINE_DIAGNOSTICS = "databricks.bundle.clearPipelineDiagnostics";
export const SHOW_PIPELINE_EVENT_DETAILS = "databricks.bundle.showPipelineEventDetails";

type RunnableType = "jobs" | "pipelines";

/** What the run actions get: an explorer row, or what "run a resource" picked. */
interface RunnableResource {
    readonly type: string;
    readonly resourceKey: string;
    readonly data?: { readonly id?: string };
}

function runnable(resource: unknown): RunnableResource & { type: RunnableType } {
    const r = resource as Partial<RunnableResource> | undefined;
    if ((r?.type !== "jobs" && r?.type !== "pipelines") || typeof r.resourceKey !== "string") {
        throw new Error(`Cannot run resource of type ${r?.type}`);
    }
    return r as RunnableResource & { type: RunnableType };
}

export interface RunCommandsDeps {
    readonly kernel: Kernel;
    readonly telemetry: TelemetryRecorder;
    readonly log: Logger;
    readonly trackers: RunTrackers;
    readonly datasets: PipelineDatasets;
    readonly diagnostics: PipelineDiagnostics;
    readonly terminals: RunTerminals;
    /** `ctx.commands.showError`, for failures that don't end the command. */
    readonly showError: (error: UserFacingError) => Promise<void>;
    /** Poll intervals and the ID timeout; the trackers' defaults otherwise. */
    readonly trackerOptions?: Omit<TrackerOptions, "log">;
}

/**
 * Deploy and run (BNDL-08 to BNDL-12), ported from the run half of the old
 * `BundleCommands` and `BundleRunStatusManager`: deploy, then `bundle run`
 * in the terminal "Run <key> (<target>)", with a tracker that the explorer
 * shows. A resource runs once at a time.
 */
export class RunCommands {
    /** Runs that are deploying or whose CLI is running, by resource key. */
    private readonly active = new Map<
        string,
        { controller?: AbortController; terminal?: string }
    >();

    constructor(private readonly deps: RunCommandsDeps) {}

    /** "Deploy the bundle and run the job" and "… the pipeline". */
    async deployAndRun(
        resource: unknown,
        options: BundleRunOptions = {},
        runType: BundleRunType = "run",
    ): Promise<void> {
        const { type, resourceKey } = runnable(resource);
        requireTarget(this.deps.kernel);
        if (this.active.has(resourceKey) || this.deps.trackers.isRunning(resourceKey)) {
            throw new UserFacingError(
                "RUN_IN_PROGRESS",
                `A run for the "${resourceKey}" is already in progress.`,
            );
        }
        this.active.set(resourceKey, {});
        const record = this.deps.telemetry.start(BUNDLE_RUN);
        const properties = { resourceType: type, runType };
        try {
            const on = await deploy(this.deps.kernel);
            const cancelled =
                on === undefined ? true : await this.run(on, type, resourceKey, options);
            record({ success: true, cancelled, ...properties });
        } catch (e) {
            record(
                isCancellation(e)
                    ? { success: true, cancelled: true, ...properties }
                    : { success: false, ...properties },
            );
            throw e;
        } finally {
            this.active.delete(resourceKey);
        }
    }

    /** Runs the CLI and follows the run. Resolves to whether it was cancelled. */
    private async run(
        on: OperationTarget,
        type: RunnableType,
        resourceKey: string,
        options: BundleRunOptions,
    ): Promise<boolean> {
        const { kernel, log, trackers, terminals } = this.deps;
        const trackerOptions = { ...this.deps.trackerOptions, log };
        const tracker =
            type === "jobs"
                ? new JobRunTracker(on.connection.api, trackerOptions)
                : new PipelineRunTracker(
                      on.connection.api,
                      this.pipelineId(resourceKey),
                      trackerOptions,
                  );
        trackers.add(resourceKey, tracker);
        const name = `Run ${resourceKey} (${on.target})`;
        const terminal = terminals.open(name);
        const controller = new AbortController();
        this.active.set(resourceKey, { controller, terminal: name });
        const closed = terminal.onDidCloseByUser(() => controller.abort());
        terminal.started(
            quoteCommandLine([kernel.cli.cliPath, ...runArgs(on.target, resourceKey, options)]),
        );
        try {
            await kernel.bundle.operations.run(on, resourceKey, {
                ...options,
                signal: controller.signal,
                onOutput: (chunk) => {
                    terminal.write(chunk);
                    tracker.write(chunk);
                },
            });
            terminal.exited(0);
            // The CLI is gone, but its run may go on (`--no-wait`): from now
            // on "Cancel run" cancels it through the tracker.
            this.active.set(resourceKey, { terminal: name });
            await tracker.cliExited(true);
            return tracker.state === "cancelled";
        } catch (e) {
            if (isCancellation(e)) {
                terminal.cancelled();
                await tracker.cancel().catch((error: unknown) => {
                    throw new UserFacingError(
                        "CANCEL_FAILED",
                        `Error cancelling run. ${errorMessage(error)}`,
                        { cause: error },
                    );
                });
                return true;
            }
            const cliError =
                e instanceof MissingVariableError
                    ? e.cliError
                    : e instanceof CliError
                      ? e
                      : undefined;
            terminal.exited(cliError?.exitCode ?? null);
            await tracker.cliExited(false);
            if (e instanceof MissingVariableError || cliError === undefined) {
                throw bundleCommandError("Error running resource.", e);
            }
            throw new UserFacingError(
                "RUN_FAILED",
                `Error running resource. Process exited with code ${cliError.exitCode}`,
                { cause: e },
            );
        } finally {
            closed.dispose();
        }
    }

    /** The deployed pipeline's ID, which the tracker polls with. */
    private pipelineId(resourceKey: string): string {
        const key = resourceKey.slice("pipelines.".length);
        const id = this.deps.kernel.bundle.deployed.latest?.summary.resources?.pipelines?.[key]?.id;
        if (id === undefined) {
            throw new UserFacingError(
                "NOT_DEPLOYED",
                `Error running resource. Pipeline id is undefined for ${resourceKey}. This likely means the pipeline is not deployed.`,
            );
        }
        return id;
    }

    /** "Deploy the bundle and validate the pipeline": `--validate-only`. */
    deployAndValidate(resource: unknown): Promise<void> {
        return this.deployAndRun(resource, { validateOnly: true }, "validate");
    }

    /** "Deploy the bundle and select pipeline tables for partial update". */
    async deployAndRunSelectedTables(resource: unknown): Promise<void> {
        const pipeline = runnable(resource);
        const { datasets } = this.deps;
        const known = datasets.fromRuns(pipeline.resourceKey).datasets;
        const id = pipeline.data?.id;
        const preload =
            id === undefined
                ? Promise.resolve(undefined)
                : datasets.preload(pipeline.resourceKey, id).then((state) => state?.datasets);
        const { tables, fullRefresh } = await showTableSelectionQuickPick(
            known,
            preload,
            this.deps.showError,
        );
        if (!tables) {
            return;
        }
        const selection = tables.split(",");
        return this.deployAndRun(
            pipeline,
            fullRefresh ? { fullRefresh: selection } : { refresh: selection },
            "partial-refresh",
        );
    }

    /**
     * "Deploy the bundle and run a resource": any job or pipeline, picked
     * unless the arguments name one, with extra CLI arguments.
     */
    async deployAndRunFromInput(
        options: { resourceType?: string; resourceKey?: string; args?: string } = {},
    ): Promise<void> {
        let { resourceType, resourceKey } = options;
        if (!resourceType || !resourceKey) {
            const resources = this.deps.kernel.bundle.deployed.latest?.summary.resources;
            const items = [
                ...Object.keys(resources?.pipelines ?? {}).map((key) => ({
                    label: key,
                    description: "Pipeline",
                    type: "pipelines",
                })),
                ...Object.keys(resources?.jobs ?? {}).map((key) => ({
                    label: key,
                    description: "Job",
                    type: "jobs",
                })),
            ];
            if (items.length === 0) {
                throw new UserFacingError(
                    "NO_RESOURCES",
                    "No pipelines or jobs found in the bundle.",
                );
            }
            const pick = await window.showQuickPick(items, {
                placeHolder: "Select a pipeline or a job to run",
            });
            if (pick === undefined) {
                return;
            }
            resourceType = pick.type;
            resourceKey = pick.label;
        }
        const extraArgs = options.args?.split(" ").filter(Boolean);
        return this.deployAndRun(
            { type: resourceType, resourceKey: `${resourceType}.${resourceKey}` },
            extraArgs?.length ? { extraArgs } : {},
            "manual-input",
        );
    }

    /** "Cancel run": kills the CLI, which stops the remote run too. */
    async cancelRun(resource: unknown): Promise<void> {
        const { resourceKey } = runnable(resource);
        const active = this.active.get(resourceKey);
        if (active?.controller !== undefined) {
            if (active.terminal !== undefined) {
                this.deps.terminals.show(active.terminal);
            }
            active.controller.abort();
            return;
        }
        // The CLI is gone, but the run may still be followed.
        await this.deps.trackers.get(resourceKey)?.cancel();
    }

    clearPipelineDiagnostics(): void {
        this.deps.diagnostics.clear();
    }

    async showPipelineEventDetails(item: unknown): Promise<void> {
        await this.deps.diagnostics.showEventDetails(
            (item as { event?: PipelineEvent } | undefined)?.event,
            this.fileMapping(),
        );
    }

    /** Updates the diagnostics from each pipeline's latest run. */
    async updateDiagnostics(): Promise<void> {
        const latest = this.deps.trackers
            .all()
            .filter((t): t is PipelineRunTracker => t.type === "pipelines");
        await this.deps.diagnostics.update(
            latest.map((t) => ({ creationTime: t.data?.creationTime, events: t.events })),
            this.fileMapping(),
        );
    }

    /** Where the bundle's files are in the workspace: validate's `workspace.file_path`. */
    private fileMapping(): SyncDestination | undefined {
        return syncDestination(this.deps.kernel.bundle.validated.latest);
    }
}
