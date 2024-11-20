import {
    BundleResourceExplorerTreeItem,
    BundleResourceExplorerTreeNode,
} from "./types";
import {ThemeColor, ThemeIcon, TreeItemCollapsibleState} from "vscode";
import {ContextUtils} from "./utils";
import {PipelineRunStatus} from "../../bundle/run/PipelineRunStatus";
import {TreeItemTreeNode} from "../TreeItemTreeNode";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {EventLevel} from "@databricks/databricks-sdk/dist/apis/pipelines";

export class PipelineRunEventsTreeNode
    implements BundleResourceExplorerTreeNode
{
    readonly type = "pipeline_run_events";

    private get update() {
        return this.runMonitor?.data;
    }

    private get events() {
        return this.runMonitor?.events;
    }

    public get url() {
        const {host} = this.connectionManager.databricksWorkspace ?? {};
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const {pipeline_id, update_id} = this.update ?? {};
        if (!host || !pipeline_id || !update_id) {
            return undefined;
        }
        return `${host}#joblist/pipelines/${pipeline_id}/updates/${update_id}`;
    }

    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly runMonitor: PipelineRunStatus,
        public parent?: BundleResourceExplorerTreeNode
    ) {}

    getChildren(): BundleResourceExplorerTreeNode[] {
        if (this.events === undefined || this.events.length === 0) {
            return [];
        }
        const children: BundleResourceExplorerTreeNode[] = [];

        for (const event of this.events) {
            children.push(
                new TreeItemTreeNode(
                    {
                        label: event.message ?? event.event_type ?? "unknown",
                        iconPath: getEventIcon(event.level),
                        tooltip: event.message,
                        contextValue: "pipeline_event",
                    },
                    this
                )
            );
        }

        return children;
    }

    isLoading(): boolean {
        return (
            (this.events === undefined || this.events.length === 0) &&
            (this.runMonitor.runState === "running" ||
                this.runMonitor.runState === "unknown")
        );
    }

    getTreeItem(): BundleResourceExplorerTreeItem {
        if (this.isLoading()) {
            return {
                label: "Event Log",
                iconPath: new ThemeIcon("loading~spin"),
                contextValue: ContextUtils.getContextString({
                    nodeType: this.type,
                }),
                collapsibleState: TreeItemCollapsibleState.None,
            };
        }

        return {
            label: "Event Log",
            iconPath: new ThemeIcon("inbox"),
            contextValue: ContextUtils.getContextString({
                nodeType: this.type,
                hasUrl: this.url !== undefined,
            }),
            collapsibleState: TreeItemCollapsibleState.Expanded,
        };
    }
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
