import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";
import {BundleResourceExplorerTreeItem, Renderer, TreeNode} from "./types";

export class TasksRenderer implements Renderer {
    readonly type = "task";
    async getTreeItem(
        element: TreeNode
    ): Promise<BundleResourceExplorerTreeItem> {
        if (element.type !== "task") {
            throw new Error("Invalid element type");
        }

        return {
            label: element.data.task_key,
            description: element.data.description,
            iconPath: undefined,
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
