import path from "path";
import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";
import {BundleResourceExplorerTreeItem, Renderer, TreeNode} from "./types";
import {ExtensionContext, TreeItemCollapsibleState} from "vscode";
export class TasksRenderer implements Renderer {
    readonly type = "task";

    constructor(private readonly context: ExtensionContext) {}

    private getTaskIconPath(taskType: string) {
        return {
            dark: this.context.asAbsolutePath(
                path.join(
                    "resources",
                    "dark",
                    "resource-explorer",
                    `${taskType}.svg`
                )
            ),
            light: this.context.asAbsolutePath(
                path.join(
                    "resources",
                    "light",
                    "resource-explorer",
                    `${taskType}.svg`
                )
            ),
        };
    }

    getTreeItem(element: TreeNode): BundleResourceExplorerTreeItem {
        if (element.type !== "task") {
            throw new Error("Invalid element type");
        }

        let iconPath: BundleResourceExplorerTreeItem["iconPath"] = undefined;

        if (element.data.pipeline_task !== undefined) {
            iconPath = this.getTaskIconPath("pipelines");
        }

        if (element.data.spark_python_task !== undefined) {
            iconPath = this.getTaskIconPath("python");
        }
        return {
            label: element.data.task_key,
            id: `${element.data.task_key}-${element.jobId}-${element.jobResourceKey}`,
            description: element.data.description,
            iconPath: iconPath,
            contextValue: "task",
            collapsibleState: element.status
                ? TreeItemCollapsibleState.Expanded
                : TreeItemCollapsibleState.None,
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getChildren(element: TreeNode): TreeNode[] {
        if (element.type !== "task") {
            return [];
        }

        const taskStatus = element.status?.tasks?.find(
            (task) => task.task_key === element.data.task_key
        );
        if (taskStatus === undefined || element.status?.run_id === undefined) {
            return [];
        }

        return [
            {
                type: "task_run_status",
                parent: element,
                jobId: element.jobId,
                jobResourceKey: element.jobResourceKey,
                runId: element.status?.run_id,
                taskKey: element.taskKey,
                status: taskStatus,
            },
        ];
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getRoots(remoteStateConfig: BundleRemoteState): TreeNode[] {
        return [];
    }
}
