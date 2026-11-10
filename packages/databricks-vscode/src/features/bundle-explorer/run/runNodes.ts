import type { RunTask } from "@databricks/sdk-jobs/v2";
import { ThemeColor, ThemeIcon, TreeItemCollapsibleState, type TreeItem } from "vscode";
import type { PipelineEvent } from "../../../kernel/connection";
import { getContextString } from "../contextValues";
import { DetailNode, type ExplorerNode } from "../explorerNode";
import type { JobRunTracker } from "./JobRunTracker";
import type { PipelineDatasets, DatasetWithSchema } from "./pipelineDatasets";
import { isFullGraphUpdate } from "./pipelineDatasets";
import type { PipelineRunTracker } from "./PipelineRunTracker";
import type { RunTracker } from "./RunTracker";
import {
    getSimplifiedJobRunState,
    getSimplifiedPipelineUpdateState,
    humaniseDate,
    humaniseDuration,
    type SimplifiedRunState,
} from "./runState";

/*
 * The run rows of the explorer (BNDL-08, BNDL-09), ported from the old
 * `JobRunStatusTreeNode`, `TaskRunStatusTreeNode`, `PipelineRunStatusTreeNode`,
 * `PipelineDatasetsTreeNode`, `PipelineEventTreeNode` and `RunStateUtils`.
 * Labels, descriptions, icons and context values are unchanged: the frozen
 * specs read "Run Status", "Start Time", the event messages and the datasets.
 */

function getThemeIconForStatus(status: SimplifiedRunState): ThemeIcon {
    switch (status) {
        case "Failed":
            return new ThemeIcon(
                "testing-error-icon",
                new ThemeColor("problemsErrorIcon.foreground"),
            );
        case "Skipped":
            return new ThemeIcon("testing-skipped-icon");
        case "Pending":
        case "Running":
            return new ThemeIcon("loading~spin");
        case "Cancelling":
        case "Terminating":
            return new ThemeIcon("sync-ignored", new ThemeColor("charts.red"));
        case "Terminated":
        case "Cancelled":
            return new ThemeIcon("circle-slash");
        case "Success":
            return new ThemeIcon("check-all", new ThemeColor("charts.green"));
        case "Timeout":
            return new ThemeIcon("warning", new ThemeColor("problemsWarningIcon.foreground"));
        default:
            return new ThemeIcon("question");
    }
}

/** No run data yet, while the run's ID is awaited or its first status read. */
function isFirstLoad(tracker?: RunTracker<unknown>): boolean {
    return tracker !== undefined && tracker.isRunning && tracker.data === undefined;
}

function isActive(status: SimplifiedRunState): boolean {
    return status === "Running" || status === "Pending";
}

/**
 * The tracker last saw the run running, but no longer reads its status
 * ("error"): the run isn't known to be running any more.
 */
function isStale(tracker: RunTracker<unknown> | undefined, status: SimplifiedRunState): boolean {
    return tracker?.state === "error" && isActive(status);
}

function isLoading(tracker: RunTracker<unknown> | undefined, status: SimplifiedRunState): boolean {
    return isFirstLoad(tracker) || (isActive(status) && !isStale(tracker, status));
}

/** A run row's description and icon: a stale status says it can't be read, rather than spinning. */
function shownStatus(
    tracker: RunTracker<unknown> | undefined,
    status: SimplifiedRunState,
): Pick<TreeItem, "description" | "iconPath"> {
    return isStale(tracker, status)
        ? { description: "Failed to fetch run status", iconPath: getThemeIconForStatus("Failed") }
        : { description: status, iconPath: getThemeIconForStatus(status) };
}

/** The rows a run gets before it has data: timeout, cancelled, failed, loading. */
function trackerOnlyItem(
    nodeType: string,
    url: string | undefined,
    tracker: RunTracker<unknown>,
): TreeItem | undefined {
    const row = (
        description: string | undefined,
        iconPath: ThemeIcon,
        hasUrl = false,
    ): TreeItem => ({
        label: "Run Status",
        iconPath,
        ...(description !== undefined ? { description } : {}),
        contextValue: getContextString({ nodeType, hasUrl }),
        collapsibleState: TreeItemCollapsibleState.None,
    });
    if (tracker.state === "timeout") {
        return row("Timeout while fetching run status", getThemeIconForStatus("Timeout"));
    }
    if (tracker.state === "cancelled" && tracker.data === undefined) {
        return row("Cancelled", getThemeIconForStatus("Cancelled"), url !== undefined);
    }
    if (tracker.state === "error" && tracker.data === undefined) {
        return row("Failed to fetch run status", getThemeIconForStatus("Failed"));
    }
    if (isFirstLoad(tracker)) {
        return row(undefined, new ThemeIcon("loading~spin"));
    }
    return undefined;
}

function runDetails(
    parent: ExplorerNode,
    state: { stateMessage?: string } | undefined,
    startTime: bigint | undefined,
    duration: bigint | undefined,
): ExplorerNode[] {
    const children: ExplorerNode[] = [];
    if (state?.stateMessage) {
        children.push(
            new DetailNode(
                {
                    label: "State Message",
                    description: state.stateMessage,
                    tooltip: state.stateMessage,
                    contextValue: "state_message",
                },
                parent,
            ),
        );
    }
    children.push(
        new DetailNode(
            {
                label: "Start Time",
                description: humaniseDate(startTime),
                contextValue: "start_time",
            },
            parent,
        ),
        new DetailNode(
            {
                label: "Duration",
                description: humaniseDuration(duration),
                contextValue: "end_time",
            },
            parent,
        ),
    );
    return children;
}

/** A job's "Run Status": the run's state, linking to its run page. */
export class JobRunStatusNode implements ExplorerNode {
    readonly type = "job_run_status";

    constructor(
        readonly tracker: JobRunTracker,
        readonly parent: ExplorerNode,
    ) {}

    get url(): string | undefined {
        return this.tracker.data?.runPageUrl;
    }

    getTreeItem(): TreeItem {
        const early = trackerOnlyItem(this.type, this.url, this.tracker);
        if (early !== undefined) {
            return early;
        }
        const run = this.tracker.data;
        if (run === undefined) {
            return {
                label: "Run Status",
                iconPath: getThemeIconForStatus("Unknown"),
                description: "Run status not available",
                contextValue: getContextString({ nodeType: this.type }),
                collapsibleState: TreeItemCollapsibleState.None,
            };
        }
        const status =
            this.tracker.state === "cancelling" ? "Cancelling" : getSimplifiedJobRunState(run);
        return {
            label: "Run Status",
            ...shownStatus(this.tracker, status),
            contextValue: getContextString({ nodeType: this.type, hasUrl: this.url !== undefined }),
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
    }

    getChildren(): ExplorerNode[] {
        const run = this.tracker.data;
        return run === undefined ? [] : runDetails(this, run.state, run.startTime, run.runDuration);
    }
}

/** A task's "Run Status", from its job's run. */
export class TaskRunStatusNode implements ExplorerNode {
    readonly type = "task_run_status";

    constructor(
        readonly task: RunTask,
        readonly parent: ExplorerNode,
        private readonly host: string,
        private readonly jobId?: string,
        /** The job run's tracker, which read the task's status. */
        private readonly tracker?: JobRunTracker,
    ) {}

    get url(): string | undefined {
        if (this.task.runId === undefined || this.jobId === undefined) {
            return undefined;
        }
        return `${this.host.replace(/\/+$/, "")}/#job/${this.jobId}/run/${this.task.runId}`;
    }

    getTreeItem(): TreeItem {
        return {
            label: "Run Status",
            ...shownStatus(this.tracker, getSimplifiedJobRunState(this.task)),
            contextValue: getContextString({ nodeType: this.type, hasUrl: this.url !== undefined }),
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
    }

    getChildren(): ExplorerNode[] {
        return runDetails(this, this.task.state, this.task.startTime, this.task.executionDuration);
    }
}

/** A pipeline's "Run Status": the update's state, its start time and its events. */
export class PipelineRunStatusNode implements ExplorerNode {
    readonly type = "pipeline_run_status";

    constructor(
        readonly tracker: PipelineRunTracker,
        readonly parent: ExplorerNode,
        private readonly host: string,
    ) {}

    get url(): string | undefined {
        const update = this.tracker.data;
        if (update?.pipelineId === undefined || update.updateId === undefined) {
            return undefined;
        }
        return `${this.host.replace(/\/+$/, "")}/#joblist/pipelines/${update.pipelineId}/updates/${update.updateId}`;
    }

    getTreeItem(): TreeItem {
        const early = trackerOnlyItem(this.type, this.url, this.tracker);
        if (early !== undefined) {
            return early;
        }
        const status =
            this.tracker.state === "cancelling"
                ? "Cancelling"
                : getSimplifiedPipelineUpdateState(this.tracker.data);
        return {
            label: "Run Status",
            ...shownStatus(this.tracker, status),
            contextValue: getContextString({ nodeType: this.type, hasUrl: this.url !== undefined }),
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
    }

    getChildren(): ExplorerNode[] {
        const update = this.tracker.data;
        if (update === undefined) {
            return [];
        }
        const children: ExplorerNode[] = [];
        if (update.creationTime) {
            children.push(
                new DetailNode(
                    {
                        label: "Start Time",
                        iconPath: new ThemeIcon("watch"),
                        description: humaniseDate(update.creationTime),
                        contextValue: "start_time",
                    },
                    this,
                ),
            );
        }
        for (const event of this.tracker.events ?? []) {
            children.push(new PipelineEventNode(event, this));
        }
        return children;
    }
}

function eventIcon(level: string | undefined): ThemeIcon {
    switch (level) {
        case "ERROR":
            return new ThemeIcon("error", new ThemeColor("list.errorForeground"));
        case "INFO":
            return new ThemeIcon("info");
        case "METRICS":
            return new ThemeIcon("dashboard");
        case "WARN":
            return new ThemeIcon("warning", new ThemeColor("list.warningForeground"));
        default:
            return new ThemeIcon("question");
    }
}

/** One event of a pipeline update, labelled by its message. It is the argument of "Show more information". */
class PipelineEventNode implements ExplorerNode {
    readonly type = "pipeline_run_event";

    constructor(
        readonly event: PipelineEvent,
        readonly parent: ExplorerNode,
    ) {}

    getTreeItem(): TreeItem {
        return {
            label: this.event.message ?? this.event.eventType ?? "unknown",
            iconPath: eventIcon(this.event.level),
            ...(this.event.message !== undefined ? { tooltip: this.event.message } : {}),
            contextValue: getContextString({
                nodeType: this.type,
                hasPipelineDetails: (this.event.error?.exceptions?.length ?? 0) > 0,
            }),
            collapsibleState: TreeItemCollapsibleState.None,
        };
    }

    getChildren(): ExplorerNode[] {
        return [];
    }
}

/** "view", "materialized view", or "" when the schema's event has no type. */
function toDescription(type: string): string {
    return type.toLowerCase().replace(/_/g, " ");
}

class PipelineDatasetNode implements ExplorerNode {
    readonly type = "pipeline_dataset";

    constructor(
        private readonly dataset: DatasetWithSchema,
        readonly parent: ExplorerNode,
    ) {}

    getTreeItem(): TreeItem {
        return {
            label: this.dataset.name,
            // VS Code adds a row's description element only for a non-empty
            // description, unless the row reuses one; a space renders as
            // nothing, and the e2e spec reads "" either way.
            description: toDescription(this.dataset.type) || " ",
            contextValue: getContextString({ nodeType: this.type }),
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
    }

    getChildren(): ExplorerNode[] {
        return this.dataset.schema.map(
            (field) =>
                new DetailNode(
                    {
                        label: field.name,
                        description: toDescription(field.type),
                        contextValue: "dataset_field",
                    },
                    this,
                ),
        );
    }
}

/**
 * A pipeline's "Datasets": those its runs in this session defined, plus
 * those of its last updates when this session's run didn't update the
 * whole graph (or there was none).
 */
export class PipelineDatasetsNode implements ExplorerNode {
    readonly type = "pipeline_datasets";

    constructor(
        private readonly resourceKey: string,
        private readonly pipelineId: string | undefined,
        private readonly datasets: PipelineDatasets,
        private readonly tracker: PipelineRunTracker | undefined,
        readonly parent: ExplorerNode,
    ) {}

    getTreeItem(): TreeItem {
        const status = getSimplifiedPipelineUpdateState(this.tracker?.data);
        return {
            label: "Datasets",
            iconPath: isLoading(this.tracker, status)
                ? new ThemeIcon("loading~spin")
                : new ThemeIcon("database"),
            contextValue: getContextString({ nodeType: this.type }),
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
    }

    async getChildren(): Promise<ExplorerNode[]> {
        const schemas = new Map(this.datasets.fromRuns(this.resourceKey).schemas);
        if (!isFullGraphUpdate(this.tracker?.data) && this.pipelineId !== undefined) {
            const preloaded = await this.datasets.preload(this.resourceKey, this.pipelineId);
            for (const [name, dataset] of preloaded?.schemas ?? []) {
                if (!schemas.has(name)) {
                    schemas.set(name, dataset);
                }
            }
        }
        if (schemas.size === 0) {
            const status = getSimplifiedPipelineUpdateState(this.tracker?.data);
            const label = isLoading(this.tracker, status)
                ? "Loading..."
                : "Run or validate the pipeline to see datasets";
            return [new DetailNode({ label, contextValue: "datasets_placeholder" }, this)];
        }
        return [...schemas.values()].map((dataset) => new PipelineDatasetNode(dataset, this));
    }
}
