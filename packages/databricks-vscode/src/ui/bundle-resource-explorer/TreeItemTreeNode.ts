import {
    BundleResourceExplorerTreeItem,
    BundleResourceExplorerTreeNode,
} from "./types";
import {TreeItem} from "vscode";

export class TreeItemTreeNode implements BundleResourceExplorerTreeNode {
    readonly type = "treeItem";
    constructor(
        public readonly treeItem: TreeItem,
        public readonly parent?: BundleResourceExplorerTreeNode
    ) {}

    getTreeItem(): BundleResourceExplorerTreeItem {
        return this.treeItem;
    }

    getChildren(): BundleResourceExplorerTreeNode[] {
        return [];
    }
}
