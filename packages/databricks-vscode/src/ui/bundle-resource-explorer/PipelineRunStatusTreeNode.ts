import {
    BundleResourceExplorerTreeItem,
    BundleResourceExplorerTreeNode,
} from "./types";
import {TreeItemCollapsibleState} from "vscode";
import {ContextUtils, RunStateUtils} from "./utils";
import {SimplifiedRunState, sentenceCase} from "./utils/RunStateUtils";
import {GetUpdateResponse} from "@databricks/databricks-sdk/dist/apis/pipelines";
import {PipelineRunStatus} from "../../bundle/run/PipelineRunStatus";
import {TreeItemTreeNode} from "./TreeItemTreeNode";
import {ConnectionManager} from "../../configuration/ConnectionManager";

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
        return this.runMonitor?.data?.update;
    }
    public get url() {
        if (this.type !== this.type) {
            return undefined;
        }
        const host = this.connectionManager.databricksWorkspace?.host;
        if (
            host === undefined ||
            this.update?.pipeline_id === undefined ||
            this.update?.update_id === undefined
        ) {
            return undefined;
        }
        return `${host.toString()}#joblist/pipelines/${
            this.update.pipeline_id
        }/updates/${this.update.update_id}`;
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

        if (this.update.cause) {
            children.push(
                new TreeItemTreeNode(
                    {
                        label: "Cause",
                        description: this.update.cause,
                        contextValue: "update_cause",
                    },
                    this
                )
            );
        }

        if (this.update.creation_time) {
            children.push(
                new TreeItemTreeNode(
                    {
                        label: "Start Time",
                        description: RunStateUtils.humaniseDate(
                            this.update.creation_time
                        ),
                        contextValue: "start_time",
                    },
                    this
                )
            );
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

        if (this.update === undefined) {
            return {
                label: "Run Status",
                iconPath: RunStateUtils.getThemeIconForStatus("Unknown"),
                description: "Run status not available",
                contextValue: ContextUtils.getContextString({
                    nodeType: this.type,
                }),
                collapsibleState: TreeItemCollapsibleState.None,
            };
        }

        const status = getSimplifiedUpdateState(this.update);
        const icon = RunStateUtils.getThemeIconForStatus(status);

        return {
            label: "Run Status",
            iconPath: icon,
            description: sentenceCase(this.update.state),
            contextValue: ContextUtils.getContextString({
                nodeType: this.type,
                hasUrl: this.url !== undefined,
            }),
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
    }
}
