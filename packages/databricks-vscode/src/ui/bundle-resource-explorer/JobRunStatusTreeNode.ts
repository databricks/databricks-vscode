import {
    BundleResourceExplorerTreeItem,
    BundleResourceExplorerTreeNode,
} from "./types";
import {TreeItemCollapsibleState} from "vscode";
import {ContextUtils, RunStateUtils} from "./utils";
import {jobs} from "@databricks/sdk-experimental";
import {JobRunStatus} from "../../bundle/run/JobRunStatus";
import {TreeItemTreeNode} from "../TreeItemTreeNode";
import {getSimplifiedJobRunState} from "./utils/RunStateUtils";

export class JobRunStatusTreeNode implements BundleResourceExplorerTreeNode {
    readonly type = "job_run_status";
    get url() {
        return this.runDetails?.run_page_url;
    }

    get runDetails(): jobs.Run | undefined {
        return this.runMonitor?.data;
    }

    constructor(
        public parent: BundleResourceExplorerTreeNode,
        public readonly runMonitor?: JobRunStatus
    ) {}

    getChildren(): BundleResourceExplorerTreeNode[] {
        if (this.runDetails === undefined) {
            return [];
        }

        const children: BundleResourceExplorerTreeNode[] = [];

        if (this.runDetails.state?.state_message) {
            children.push(
                new TreeItemTreeNode(
                    {
                        label: "State Message",
                        description: this.runDetails.state?.state_message,
                        tooltip: this.runDetails.state?.state_message,
                        contextValue: "state_message",
                    },
                    this
                )
            );
        }
        children.push(
            new TreeItemTreeNode(
                {
                    label: "Start Time",
                    description: RunStateUtils.humaniseDate(
                        this.runDetails.start_time
                    ),
                    contextValue: "start_time",
                },
                this
            ),
            new TreeItemTreeNode(
                {
                    label: "Duration",
                    description: RunStateUtils.humaniseDuration(
                        this.runDetails.run_duration
                    ),
                    contextValue: "end_time",
                },
                this
            )
        );
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

        if (this.runDetails === undefined) {
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

        const status =
            this.runMonitor?.runState === "cancelling"
                ? "Cancelling"
                : getSimplifiedJobRunState(this.runDetails);

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
