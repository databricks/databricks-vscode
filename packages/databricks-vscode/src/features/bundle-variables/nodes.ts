import { TreeItemCollapsibleState, type TreeItem } from "vscode";
import type { LocalVariable } from "../../kernel/bundle/LocalBundleConfig";
import type { BundleVariable } from "../../kernel/cli/commands/bundle";
import { TreeItemNode, type TreeNode } from "../../platform/ui/tree";

/*
 * The rows of the Variables group: one per variable, labelled with its name and
 * described by its value for the target, with a "Default" row below it.
 * Ported from the old `VariableTreeNode` and `LookupVariableTreeNode`.
 */

/** Complex values show as compact JSON; anything else as a string. */
export function formatValue(value: unknown, type?: string): string {
    if (value === undefined) {
        return "";
    }
    if (type === "complex" || (typeof value === "object" && value !== null)) {
        try {
            return JSON.stringify(value);
        } catch {
            return "complex variable";
        }
    }
    return String(value as string | number | boolean | bigint | symbol);
}

export class VariableNode implements TreeNode {
    constructor(
        readonly name: string,
        /** From `bundle validate`: the value resolved for the target. None before validate, or for an undeclared name. */
        readonly resolved: BundleVariable = {},
        /** From the YAML: the top-level definition, before the target overrides it. */
        readonly definition?: LocalVariable,
        /**
         * From `vscode.bundlevars.json`. Shown as soon as the file is read,
         * before validate has resolved it, as the old view did.
         */
        readonly override?: string,
    ) {}

    private get hasValue(): boolean {
        return this.override !== undefined || this.resolved.value !== undefined;
    }

    /** An override of a name the YAML doesn't declare: `bundle validate` doesn't use it. */
    private get undeclared(): boolean {
        return (
            this.override !== undefined &&
            this.definition === undefined &&
            this.resolved.value === undefined
        );
    }

    /** The default, as the definition or validate states it; undefined when there is none. */
    private get fallback(): unknown {
        return this.definition?.default ?? this.resolved.default ?? this.resolved.value;
    }

    private get hasDefault(): boolean {
        return this.fallback !== undefined;
    }

    getTreeItem(): TreeItem {
        if (this.resolved.lookup !== undefined) {
            return {
                label: this.name,
                description: Object.values(this.resolved.lookup).find(
                    (v): v is string => typeof v === "string",
                ),
                collapsibleState: TreeItemCollapsibleState.Collapsed,
            };
        }
        return {
            label: this.name,
            description: this.undeclared
                ? `${this.override} (not in the bundle)`
                : (this.override ?? formatValue(this.resolved.value, this.resolved.type)),
            collapsibleState:
                this.hasValue && this.hasDefault
                    ? TreeItemCollapsibleState.Collapsed
                    : TreeItemCollapsibleState.None,
        };
    }

    getChildren(): TreeNode[] {
        const { lookup } = this.resolved;
        if (lookup !== undefined) {
            const key = Object.keys(lookup).find((k) => lookup[k] !== undefined);
            return [
                new TreeItemNode({ label: key, description: formatValue(this.resolved.value) }),
            ];
        }
        if (!this.hasValue || !this.hasDefault) {
            return [];
        }
        return [
            new TreeItemNode({
                label: "Default",
                description: formatValue(this.fallback, this.resolved.type),
            }),
        ];
    }
}
