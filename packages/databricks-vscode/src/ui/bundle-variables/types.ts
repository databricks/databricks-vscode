import {TreeItem} from "vscode";
import {BundleVariable} from "../../bundle/models/BundleVariableModel";

export type BundleVariableTreeItem = TreeItem;

export interface BundleVariableTreeNode {
    readonly key?: string;
    readonly value?: BundleVariable;
    parent?: BundleVariableTreeNode;
    getTreeItem(): BundleVariableTreeItem;
    getChildren(): BundleVariableTreeNode[];
}
