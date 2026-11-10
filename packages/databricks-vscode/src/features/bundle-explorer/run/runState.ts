import type { Run, RunTask } from "@databricks/sdk-jobs/v2";
import type { UpdateInfo } from "@databricks/sdk-pipelines/v2";

/*
 * The run states the explorer shows, ported from the old `RunStateUtils.ts`.
 * The SDK's types are camelCase with `bigint` times; the labels and the
 * mapping are unchanged, except for the cases noted below.
 */

/** What a tracker knows about its run, apart from the run's own state. */
export type TrackerState =
    /** Waiting for the run's ID in the CLI's output. */
    | "unknown"
    | "running"
    | "completed"
    /** The CLI failed before a run started, or the run's status couldn't be read. */
    | "error"
    /** No run ID within 60 seconds. */
    | "timeout"
    | "cancelling"
    | "cancelled";

export type SimplifiedRunState =
    | "Terminated"
    | "Failed"
    | "Skipped"
    | "Pending"
    | "Running"
    | "Terminating"
    | "Cancelled"
    | "Cancelling"
    | "Success"
    | "Unknown"
    | "Timeout";

/** A job run, or one of its task runs. */
export function getSimplifiedJobRunState(run?: Pick<Run | RunTask, "state">): SimplifiedRunState {
    const state = run?.state;
    switch (state?.lifeCycleState) {
        case undefined:
            return "Unknown";
        case "INTERNAL_ERROR":
            return "Failed";
        case "SKIPPED":
            return "Skipped";
        // QUEUED is newer than the old mapping, which showed it as "Unknown".
        case "QUEUED":
        case "WAITING_FOR_RETRY":
        case "BLOCKED":
        case "PENDING":
            return "Pending";
        case "RUNNING":
            return state.userCancelledOrTimedout ? "Terminating" : "Running";
        case "TERMINATING":
            return "Terminating";
        case "TERMINATED":
            if (state.userCancelledOrTimedout) {
                return "Cancelled";
            }
            switch (state.resultState) {
                case "SUCCESS":
                case "SUCCESS_WITH_FAILURES":
                    return "Success";
                case "MAXIMUM_CONCURRENT_RUNS_REACHED":
                case "FAILED":
                case "TIMEDOUT":
                    return "Failed";
                case "UPSTREAM_CANCELED":
                case "UPSTREAM_FAILED":
                case "EXCLUDED":
                case "DISABLED":
                    return "Skipped";
                case "CANCELED":
                    return "Cancelled";
                default:
                    return "Terminated";
            }
        default:
            return "Unknown";
    }
}

/** Lifecycle states after which a job run never changes: the SDK's waiters stop on the same three. */
export function isJobRunTerminal(run?: Pick<Run, "state">): boolean {
    const lifeCycle = run?.state?.lifeCycleState;
    return lifeCycle === "TERMINATED" || lifeCycle === "SKIPPED" || lifeCycle === "INTERNAL_ERROR";
}

export function getSimplifiedPipelineUpdateState(
    update?: Pick<UpdateInfo, "state">,
): SimplifiedRunState {
    switch (update?.state) {
        case undefined:
            return "Unknown";
        case "RESETTING":
        case "CREATED":
        case "QUEUED":
        case "INITIALIZING":
        case "SETTING_UP_TABLES":
        case "WAITING_FOR_RESOURCES":
            return "Pending";
        case "RUNNING":
            return "Running";
        case "COMPLETED":
            return "Success";
        case "FAILED":
            return "Failed";
        case "CANCELED":
            return "Cancelled";
        case "STOPPING":
            return "Terminating";
        default:
            return "Unknown";
    }
}

/** An update that has a state and hasn't reached a final one. */
export function isPipelineUpdateRunning(update?: Pick<UpdateInfo, "state">): boolean {
    const state = update?.state;
    return state !== undefined && !["COMPLETED", "FAILED", "CANCELED"].includes(state);
}

/** "3 Oct, 2026 12:00:00", as the old `DateUtils.toString`. */
export function humaniseDate(timestamp?: number | bigint): string | undefined {
    if (timestamp === undefined) {
        return undefined;
    }
    const date = new Date(Number(timestamp));
    const month = date.toLocaleString("default", { month: "short" });
    return `${date.getDate()} ${month}, ${date.getFullYear()} ${date.toLocaleTimeString()}`;
}

/** "42s", "1.5m", "2.25h". */
export function humaniseDuration(ms?: number | bigint): string | undefined {
    if (ms === undefined) {
        return undefined;
    }
    const seconds = Math.floor(Number(ms) / 1000);
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Number((seconds / 60).toFixed(2));
    if (minutes < 60) {
        return `${minutes}m`;
    }
    return `${Number((minutes / 60).toFixed(2))}h`;
}
