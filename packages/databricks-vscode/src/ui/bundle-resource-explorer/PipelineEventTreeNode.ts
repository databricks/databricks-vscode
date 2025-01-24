import {ThemeColor, ThemeIcon} from "vscode";
import {ContextUtils} from "./utils";
import {TreeItemTreeNode} from "../TreeItemTreeNode";
import {
    EventLevel,
    PipelineEvent,
} from "@databricks/databricks-sdk/dist/apis/pipelines";

export class PipelineEventTreeNode<T> extends TreeItemTreeNode<T> {
    constructor(
        public event: PipelineEvent,
        parent: T
    ) {
        super(
            {
                label: event.message ?? event.event_type ?? "unknown",
                iconPath: getEventIcon(event.level),
                tooltip: event.message,
                contextValue: ContextUtils.getContextString({
                    nodeType: "pipeline_run_event",
                    hasPipelineDetails: hasDetails(event),
                }),
            },
            parent
        );
    }
}

function hasDetails(event: PipelineEvent): boolean {
    return (
        event.error?.exceptions !== undefined &&
        event.error.exceptions.length > 0
    );
}

function getEventIcon(level: EventLevel | undefined): ThemeIcon {
    switch (level) {
        case "ERROR":
            return new ThemeIcon(
                "error",
                new ThemeColor("list.errorForeground")
            );
        case "INFO":
            return new ThemeIcon("info");
        case "METRICS":
            return new ThemeIcon("dashboard");
        case "WARN":
            return new ThemeIcon(
                "warning",
                new ThemeColor("list.warningForeground")
            );
        default:
            return new ThemeIcon("question");
    }
}
