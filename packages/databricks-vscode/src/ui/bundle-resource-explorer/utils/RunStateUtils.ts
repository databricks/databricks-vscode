import {ThemeColor, ThemeIcon} from "vscode";
import {DateUtils} from "../../../utils";

export type SimplifiedRunState =
    | "Terminated"
    | "Failed"
    | "Skipped"
    | "Pending"
    | "Running"
    | "Terminating"
    | "Cancelled"
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
            return new ThemeIcon("watch");
        case "Running":
            return new ThemeIcon("sync~spin", new ThemeColor("charts.green"));
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

export function sentenceCase(str?: string, sep: string = "_") {
    if (str === undefined) {
        return undefined;
    }

    return (str.charAt(0).toUpperCase() + str.slice(1).toLowerCase())
        .split(sep)
        .join(" ");
}
