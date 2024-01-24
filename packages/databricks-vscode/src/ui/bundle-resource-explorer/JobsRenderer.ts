import {ThemeColor, ThemeIcon, TreeItemCollapsibleState} from "vscode";
import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";
import {BundleResourceExplorerTreeItem, Renderer, TreeNode} from "./types";
import {BundleRunManager} from "../../bundle/BundleRunManager";

export class JobsRenderer implements Renderer {
    readonly type = "jobs";

    constructor(private readonly bundleRunManager: BundleRunManager) {}
    getTreeItem(element: TreeNode): BundleResourceExplorerTreeItem {
        if (element.type !== this.type) {
            throw new Error("Invalid element type");
        }

        const isRunning = this.bundleRunManager.isRunning(element.resourceKey);
        return {
            label: element.data.name,
            iconPath: isRunning
                ? new ThemeIcon(
                      "sync~spin",
                      new ThemeColor("debugIcon.startForeground")
                  )
                : undefined,
            contextValue: `databricks.bundle.resource-explorer.${
                isRunning ? "running" : "runnable"
            }.job`,
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
    }

    getChildren(element: TreeNode): TreeNode[] {
        if (element.type !== this.type) {
            return [];
        }

        if (element.data.tasks === undefined) {
            return [];
        }

        return element.data.tasks.map((task) => {
            return {
                type: "task",
                jobId: element.data.id,
                jobKey: element.resourceKey,
                resourceKey: `${element.resourceKey}.tasks.${task.task_key}`,
                parent: element,
                data: task,
            };
        });
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
