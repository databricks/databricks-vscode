import type { Event, TreeDataProvider, TreeItem } from "vscode";
import { Emitter } from "../event";
import type { Logger } from "../log";

/** A node that knows how to render itself and list its children. */
export interface TreeNode {
    getTreeItem(): TreeItem | Thenable<TreeItem>;
    getChildren?(): TreeNode[] | Promise<TreeNode[]>;
}

/** A leaf wrapping a ready-made `TreeItem`. */
export class TreeItemNode<P extends TreeNode = TreeNode> implements TreeNode {
    readonly type = "treeItem";

    constructor(
        readonly treeItem: TreeItem,
        readonly parent?: P,
    ) {}

    getTreeItem(): TreeItem {
        return this.treeItem;
    }

    getChildren(): TreeNode[] {
        return [];
    }
}

/**
 * A `TreeDataProvider` over `TreeNode`s. A failing `getChildren` is logged and
 * renders as no children, so one broken node can't blank the whole view.
 */
export class NodeTreeDataProvider<T extends TreeNode> implements TreeDataProvider<T> {
    private readonly changed = new Emitter<T | undefined>();
    readonly onDidChangeTreeData: Event<T | undefined> = this.changed.event;

    constructor(
        private readonly roots: () => T[] | Promise<T[]>,
        private readonly log: Logger,
    ) {}

    refresh(node?: T) {
        this.changed.fire(node);
    }

    getTreeItem(node: T): TreeItem | Thenable<TreeItem> {
        return node.getTreeItem();
    }

    async getChildren(node?: T): Promise<T[]> {
        try {
            if (node === undefined) {
                return await this.roots();
            }
            return ((await node.getChildren?.()) ?? []) as T[];
        } catch (e) {
            this.log.error("Failed to list tree children", e);
            return [];
        }
    }

    dispose() {
        this.changed.dispose();
    }
}
