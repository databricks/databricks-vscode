import type { Location, TreeItem } from "vscode";
import type { TreeNode } from "../../platform/ui/tree";

/**
 * A node of the bundle's resources (the Resources group of the Project view). Each node is also the argument of
 * the row's actions (`databricks.utils.*`, the run commands), so it exposes
 * `url`, `sourceLocation` and `type`.
 */
export interface ExplorerNode extends TreeNode {
    readonly type: string;
    readonly url?: string;
    readonly sourceLocation?: Location;
    getTreeItem(): TreeItem;
    getChildren(): ExplorerNode[] | Promise<ExplorerNode[]>;
}

/** A plain row: a pipeline's catalog, a run's start time, a column. */
export class DetailNode implements ExplorerNode {
    readonly type = "treeItem";

    constructor(
        private readonly item: TreeItem,
        readonly parent: ExplorerNode,
    ) {}

    getTreeItem(): TreeItem {
        return this.item;
    }

    getChildren(): ExplorerNode[] {
        return [];
    }
}
