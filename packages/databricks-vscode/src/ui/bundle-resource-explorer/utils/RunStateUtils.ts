import {ThemeColor, ThemeIcon, TreeItemCollapsibleState} from "vscode";
import {DateUtils} from "../../../utils";
import {BundleRunStatus} from "../../../bundle/run/BundleRunStatus";
import {ContextUtils} from ".";
import {
    BundleResourceExplorerTreeItem,
    BundleResourceExplorerTreeNode,
} from "../types";
import {GetUpdateResponse} from "@databricks/sdk-experimental/dist/apis/pipelines";
import {Run} from "@databricks/sdk-experimental/dist/apis/jobs";

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

export function humaniseDate(timestamp?: number) {
    if (timestamp === undefined) {
        return undefined;
    }
    const date = new Date(timestamp);
    return DateUtils.toString(date);
}

export function humaniseDuration(ms?: number) {
    if (ms === undefined) {
        return undefined;
    }
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Number((seconds / 60).toFixed(2));
    if (minutes < 60) {
        return `${minutes}m`;
    }

    const hours = Number((minutes / 60).toFixed(2));
    return `${hours}h`;
}

export function getThemeIconForStatus(status: SimplifiedRunState): ThemeIcon {
    switch (status) {
        case "Failed":
            return new ThemeIcon(
                "testing-error-icon",
                new ThemeColor("problemsErrorIcon.foreground")
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
            return new ThemeIcon(
                "warning",
                new ThemeColor("problemsWarningIcon.foreground")
            );
        default:
            return new ThemeIcon("question");
    }
}

export function getSimplifiedPipelineUpdateState(
    update?: GetUpdateResponse["update"]
): SimplifiedRunState {
    if (update?.state === undefined) {
        return "Unknown";
    }
    switch (update.state) {
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

export function getSimplifiedJobRunState(run?: Run): SimplifiedRunState {
    if (run?.state?.life_cycle_state === undefined) {
        return "Unknown";
    }

    switch (run.state.life_cycle_state) {
        case "INTERNAL_ERROR":
            return "Failed";
        case "SKIPPED":
            return "Skipped";
        case "WAITING_FOR_RETRY":
        case "BLOCKED":
        case "PENDING":
            return "Pending";
        case "RUNNING":
            if (run.state.user_cancelled_or_timedout) {
                return "Terminating";
            }
            return "Running";
        case "TERMINATING":
            return "Terminating";
        case "TERMINATED":
            if (run.state.user_cancelled_or_timedout) {
                return "Cancelled";
            }
            switch (run.state.result_state) {
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
                    return "Skipped";
                case "CANCELED":
                    return "Cancelled";
            }
            return "Terminated";
    }

    return "Unknown";
}

export function isInLoadingState(
    runMonitor?: BundleRunStatus,
    runState?: SimplifiedRunState
): boolean {
    return (
        isInFirstLoadState(runMonitor) ||
        runState === "Running" ||
        runState === "Pending"
    );
}

export function isInFirstLoadState(runMonitor?: BundleRunStatus): boolean {
    return (
        (runMonitor?.runState === "running" ||
            runMonitor?.runState === "unknown") &&
        !runMonitor.data
    );
}

export function getTreeItemFromRunMonitorStatus(
    type: BundleResourceExplorerTreeNode["type"],
    url?: string,
    runMonitor?: BundleRunStatus
): BundleResourceExplorerTreeItem | undefined {
    if (runMonitor?.runState === "timeout") {
        return {
            label: "Run Status",
            iconPath: getThemeIconForStatus("Timeout"),
            description: "Timeout while fetching run status",
            contextValue: ContextUtils.getContextString({
                nodeType: type,
            }),
            collapsibleState: TreeItemCollapsibleState.None,
        };
    }

    if (runMonitor?.runState === "cancelled" && !runMonitor.data) {
        return {
            label: "Run Status",
            iconPath: getThemeIconForStatus("Cancelled"),
            description: "Cancelled",
            contextValue: ContextUtils.getContextString({
                nodeType: type,
                hasUrl: url !== undefined,
            }),
            collapsibleState: TreeItemCollapsibleState.None,
        };
    }

    if (runMonitor?.runState === "error" && !runMonitor.data) {
        return {
            label: "Run Status",
            iconPath: getThemeIconForStatus("Failed"),
            description: "Failed to fetch run status",
            contextValue: ContextUtils.getContextString({nodeType: type}),
            collapsibleState: TreeItemCollapsibleState.None,
        };
    }

    if (isInFirstLoadState(runMonitor)) {
        return {
            label: "Run Status",
            iconPath: new ThemeIcon("loading~spin"),
            contextValue: ContextUtils.getContextString({nodeType: type}),
            collapsibleState: TreeItemCollapsibleState.None,
        };
    }
}
