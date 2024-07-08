import {TreeItemCollapsibleState} from "vscode";
import {BundleVariable} from "../../bundle/models/BundleVariableModel";
import {BundleVariableTreeItem, BundleVariableTreeNode} from "./types";
import {TreeItemTreeNode} from "../TreeItemTreeNode";

export class VariableTreeNode implements BundleVariableTreeNode {
    constructor(
        public readonly key: string,
        public readonly value: BundleVariable,
        public readonly parent?: BundleVariableTreeNode
    ) {}

    getTreeItem(): BundleVariableTreeItem {
        return {
            label: this.key,
            description:
                this.value.vscodeOverrideValue ??
                this.value.valueInTarget ??
                "",
            collapsibleState: this.value.valueInTarget
                ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.None,
        };
    }

    getChildren(): BundleVariableTreeNode[] {
        if (this.value.valueInTarget !== undefined) {
            return [
                new TreeItemTreeNode({
                    label: "Default",
                    description: this.value.default ?? this.value.valueInTarget,
                }),
            ];
        }
        return [];
    }
}
