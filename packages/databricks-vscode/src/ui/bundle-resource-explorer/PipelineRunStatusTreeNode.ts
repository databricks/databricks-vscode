import {
    BundleResourceExplorerTreeItem,
    BundleResourceExplorerTreeNode,
} from "./types";
import {ThemeIcon, TreeItemCollapsibleState} from "vscode";
import {ContextUtils, RunStateUtils} from "./utils";
import {SimplifiedRunState} from "./utils/RunStateUtils";
import {GetUpdateResponse} from "@databricks/databricks-sdk/dist/apis/pipelines";
import {PipelineRunStatus} from "../../bundle/run/PipelineRunStatus";
import {TreeItemTreeNode} from "../TreeItemTreeNode";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {PipelineEventTreeNode} from "./PipelineEventTreeNode";

function getSimplifiedUpdateState(
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

export class PipelineRunStatusTreeNode
    implements BundleResourceExplorerTreeNode
{
    readonly type = "pipeline_run_status";

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
        if (this.update === undefined) {
            return [];
        }
        const children: BundleResourceExplorerTreeNode[] = [];

        if (this.update.creation_time) {
            children.push(
                new TreeItemTreeNode(
                    {
                        label: "Start Time",
                        iconPath: new ThemeIcon("watch"),
                        description: RunStateUtils.humaniseDate(
                            this.update.creation_time
                        ),
                        contextValue: "start_time",
                    },
                    this
                )
            );
        }

        for (const event of this.events ?? []) {
            children.push(new PipelineEventTreeNode(event, this));
        }

        return children;
    }

    getTreeItem(): BundleResourceExplorerTreeItem {
        const runMonitorRunStateTreeItem =
            RunStateUtils.getTreeItemFromRunMonitorStatus(
                this.type,
                this.url,
                this.runMonitor
            );

        if (runMonitorRunStateTreeItem) {
            return runMonitorRunStateTreeItem;
        }

        const status =
            this.runMonitor.runState === "cancelling"
                ? "Cancelling"
                : getSimplifiedUpdateState(this.update);

        return {
            label: "Run Status",
            iconPath: RunStateUtils.getThemeIconForStatus(status),
            description: status,
            contextValue: ContextUtils.getContextString({
                nodeType: this.type,
                hasUrl: this.url !== undefined,
            }),
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
    }
}
