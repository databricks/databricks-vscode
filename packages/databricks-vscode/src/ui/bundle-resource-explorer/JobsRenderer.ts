import {TreeItemCollapsibleState} from "vscode";
import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";
import {BundleResourceExplorerTreeItem, Renderer, TreeNode} from "./types";
import {BundleRunStatusManager} from "../../bundle/run/BundleRunStatusManager";
import {Run} from "@databricks/databricks-sdk/dist/apis/jobs";

export class JobsRenderer implements Renderer {
    readonly type = "jobs";

    constructor(
        private readonly bundleRunStatusManager: BundleRunStatusManager
    ) {}

    isRunning(resourceKey: string) {
        const runner = this.bundleRunStatusManager.runStatuses.get(resourceKey);
        return runner?.runState === "running";
    }

    getTreeItem(element: TreeNode): BundleResourceExplorerTreeItem {
        if (element.type !== this.type) {
            throw new Error("Invalid element type");
        }

        const isRunning = this.isRunning(element.resourceKey);

        return {
            label: element.data.name,
            contextValue: `databricks.bundle.resource-explorer.${
                isRunning ? "running" : "runnable"
            }.job`,
            collapsibleState: isRunning
                ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.Expanded,
        };
    }

    getChildren(element: TreeNode): TreeNode[] {
        if (element.type !== this.type) {
            return [];
        }

        if (element.data.tasks === undefined) {
            return [];
        }

        const children: TreeNode[] = [];
        const runMonitor = this.bundleRunStatusManager.runStatuses.get(
            element.resourceKey
        );
        const status = runMonitor?.data as Run | undefined;
        if (status?.run_id !== undefined) {
            children.push({
                type: "job_run_status",
                parent: element,
                jobId: element.data.id,
                resourceKey: element.resourceKey,
                runId: status.run_id,
                status,
            });
        }

        children.push(
            ...element.data.tasks.map((task) => {
                return {
                    type: "task",
                    jobId: element.data.id,
                    jobResourceKey: element.resourceKey,
                    taskKey: `${element.resourceKey}.tasks.${task.task_key}`,
                    parent: element,
                    data: task,
                    status,
                } as TreeNode;
            })
        );

        return children;
    }

    getRoots(remoteStateConfig: BundleRemoteState): TreeNode[] {
        const jobs = remoteStateConfig?.resources?.jobs;
        if (jobs === undefined) {
            return [];
        }

        return Object.keys(jobs).map((jobKey) => {
            return {
                type: this.type,
                data: jobs[jobKey],
                resourceKey: `jobs.${jobKey}`,
            };
        });
    }
}
