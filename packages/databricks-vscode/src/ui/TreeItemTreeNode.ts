import {TreeItem} from "vscode";

export class TreeItemTreeNode<T> {
    readonly type = "treeItem";
    constructor(
        public readonly treeItem: TreeItem,
        public readonly parent?: T
    ) {}

    getTreeItem(): TreeItem {
        return this.treeItem;
    }

    getChildren(): T[] {
        return [];
    }
}
