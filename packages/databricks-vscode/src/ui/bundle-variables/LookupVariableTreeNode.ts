import {TreeItemCollapsibleState} from "vscode";
import {BundleVariable} from "../../bundle/models/BundleVariableModel";
import {BundleVariableTreeItem, BundleVariableTreeNode} from "./types";
import {TreeItemTreeNode} from "../TreeItemTreeNode";

export class LookupVariableTreeNode implements BundleVariableTreeNode {
    constructor(
        public readonly key: string,
        public readonly value: BundleVariable,
        public readonly parent?: BundleVariableTreeNode
    ) {}

    getTreeItem(): BundleVariableTreeItem {
        const lookup = this.value.lookup as any;
        const lookupValue = Object.values(lookup).find(
            (v) => v !== undefined
        ) as string | undefined;

        return {
            label: this.key,
            description: lookupValue,
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
    }

    getChildren(): BundleVariableTreeNode[] {
        const lookup = this.value.lookup as any;
        const lookupKey = Object.keys(lookup).find(
            (key) => lookup[key] !== undefined
        );

        return [
            new TreeItemTreeNode({
                label: lookupKey,
                description: this.value.valueInTarget,
            }),
        ];
    }
}
