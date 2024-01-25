import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";
import {BundleResourceExplorerTreeItem, Renderer, TreeNode} from "./types";
import {TreeItemCollapsibleState} from "vscode";
import {JobStateUtils, RunStateUtils} from "./utils";

export class TaskRunStatusRenderer implements Renderer {
    readonly type = "task_run_status";
    constructor() {}
    getChildren(element: TreeNode): TreeNode[] {
        if (element.type !== this.type || element.status === undefined) {
            return [];
        }

        const children: TreeNode[] = [];

        if (element.status.state?.state_message) {
            children.push({
                type: "treeItem",
                treeItem: {
                    label: "State Message",
                    description: element.status.state?.state_message,
                    contextValue: "state_message",
                },
            });
        }
        children.push(
            {
                type: "treeItem",
                treeItem: {
                    label: "Start Time",
                    description: RunStateUtils.humaniseDate(
                        element.status.start_time
                    ),
                    contextValue: "start_time",
                },
            },
            {
                type: "treeItem",
                treeItem: {
                    label: "Duration",
                    description: RunStateUtils.humaniseDuration(
                        element.status.execution_duration
                    ),
                    contextValue: "end_time",
                },
            }
        );
        return children;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getRoots(remoteStateConfig: BundleRemoteState): TreeNode[] {
        return [];
    }

    getTreeItem(element: TreeNode): BundleResourceExplorerTreeItem {
        if (element.type !== this.type) {
            throw new Error("Invalid element type");
        }
        if (element.status === undefined) {
            throw new Error("No status found for job run");
        }
        const status = JobStateUtils.getSimplifiedRunState(element.status);
        const icon = RunStateUtils.getThemeIconForStatus(status);
        return {
            label: "Run Status",
            iconPath: icon,
            description: status,
            contextValue: `databricks.bundle.resource-explorer.${status.toLowerCase()}.task.status`,
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
    }
}
