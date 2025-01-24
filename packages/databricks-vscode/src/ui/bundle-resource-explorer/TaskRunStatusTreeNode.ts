import {
    BundleResourceExplorerTreeItem,
    BundleResourceExplorerTreeNode,
} from "./types";
import {TreeItemCollapsibleState} from "vscode";
import {ContextUtils, RunStateUtils} from "./utils";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {jobs} from "@databricks/databricks-sdk";
import {TreeItemTreeNode} from "../TreeItemTreeNode";
import {TaskTreeNode} from "./TaskTreeNode";

export class TaskRunStatusTreeNode implements BundleResourceExplorerTreeNode {
    readonly type = "task_run_status";
    get url() {
        if (this.type !== this.type) {
            return undefined;
        }
        const host = this.connectionManager.databricksWorkspace?.host;
        if (
            host === undefined ||
            this.runDetails.run_id === undefined ||
            this.jobId === undefined
        ) {
            return undefined;
        }

        return `${host.toString()}#job/${this.jobId}/run/${
            this.runDetails.run_id
        }`;
    }

    constructor(
        private readonly connectionManager: ConnectionManager,
        public readonly runDetails: jobs.RunTask,
        public readonly parent: TaskTreeNode,
        public readonly jobId?: string
    ) {}

    getChildren(): BundleResourceExplorerTreeNode[] {
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
                        this.runDetails.execution_duration
                    ),
                    contextValue: "end_time",
                },
                this
            )
        );
        return children;
    }

    getTreeItem(): BundleResourceExplorerTreeItem {
        const status = RunStateUtils.getSimplifiedJobRunState(this.runDetails);
        const icon = RunStateUtils.getThemeIconForStatus(status);
        return {
            label: "Run Status",
            iconPath: icon,
            description: status,
            contextValue: ContextUtils.getContextString({
                nodeType: this.type,
                hasUrl: this.url !== undefined,
            }),
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
    }
}
