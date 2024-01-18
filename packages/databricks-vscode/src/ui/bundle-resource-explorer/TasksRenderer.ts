import path from "path";
import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";
import {BundleResourceExplorerTreeItem, Renderer, TreeNode} from "./types";
import {ExtensionContext} from "vscode";
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

    async getTreeItem(
        element: TreeNode
    ): Promise<BundleResourceExplorerTreeItem> {
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
            id: `${element.data.task_key}-${element.jobId}-${element.jobKey}`,
            description: element.data.description,
            iconPath: iconPath,
            contextValue: "task",
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async getChildren(element: TreeNode): Promise<TreeNode[]> {
        return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async getRoots(remoteStateConfig: BundleRemoteState): Promise<TreeNode[]> {
        return [];
    }
}
