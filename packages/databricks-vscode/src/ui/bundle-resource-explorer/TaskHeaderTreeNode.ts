import {TaskTreeNode} from "./TaskTreeNode";
import {
    BundleResourceExplorerTreeItem,
    BundleResourceExplorerTreeNode,
} from "./types";
import {TreeItemCollapsibleState} from "vscode";

export class TaskHeaderTreeNode implements BundleResourceExplorerTreeNode {
    readonly type = "task_header";

    constructor(
        public readonly children: TaskTreeNode[],
        public readonly parent: BundleResourceExplorerTreeNode
    ) {
        this.children.forEach((child) => {
            child.parent = this;
        });
    }

    getTreeItem(): BundleResourceExplorerTreeItem {
        return {
            label: "Tasks",
            contextValue: "task_header",
            collapsibleState:
                this.children.length > 0
                    ? TreeItemCollapsibleState.Expanded
                    : TreeItemCollapsibleState.None,
        };
    }

    getChildren(): BundleResourceExplorerTreeNode[] {
        return this.children;
    }
}
