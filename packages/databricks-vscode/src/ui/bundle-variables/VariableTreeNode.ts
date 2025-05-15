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

    get targetValue() {
        const value =
            this.value.vscodeOverrideValue ?? this.value.valueInTarget ?? "";
        if (this.value.type === "complex") {
            return this.complexValueToString(value);
        } else {
            return String(value);
        }
    }

    get defaultValue() {
        const value = this.value.default ?? this.value.valueInTarget;
        if (this.value.type === "complex") {
            return this.complexValueToString(value);
        } else {
            return String(value);
        }
    }

    complexValueToString(value: any) {
        try {
            return JSON.stringify(value);
        } catch (error) {
            return "complex vairable";
        }
    }

    getTreeItem(): BundleVariableTreeItem {
        return {
            label: this.key,
            description: this.targetValue,
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
                    description: this.defaultValue,
                }),
            ];
        }
        return [];
    }
}
