import {ThemeColor, ThemeIcon, TreeItemCollapsibleState} from "vscode";
import {DateUtils} from "../../../utils";
import {BundleRunStatus} from "../../../bundle/run/BundleRunStatus";
import {ContextUtils} from ".";
import {
    BundleResourceExplorerTreeItem,
    BundleResourceExplorerTreeNode,
} from "../types";

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
            return new ThemeIcon("sync~spin", new ThemeColor("charts.green"));
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

    if (
        (runMonitor?.runState === "running" ||
            runMonitor?.runState === "unknown") &&
        !runMonitor.data
    ) {
        return {
            label: "Run Status",
            iconPath: new ThemeIcon("loading~spin"),
            contextValue: ContextUtils.getContextString({nodeType: type}),
            collapsibleState: TreeItemCollapsibleState.None,
        };
    }
}
