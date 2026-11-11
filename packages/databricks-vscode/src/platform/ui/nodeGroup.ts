import type { Event, TreeItemCollapsibleState } from "vscode";
import type { Logger } from "../log";
import type { ConfigurationItem, ConfigurationSection } from "./sections";
import type { TreeNode } from "./tree";

/** The node each row of a group stands for, so an action on the row gets that node. */
const nodes = new WeakMap<object, TreeNode>();

/** The node a group's row stands for, or undefined when the value isn't such a row. */
export function nodeOfRow(row: unknown): TreeNode | undefined {
    return typeof row === "object" && row !== null ? nodes.get(row) : undefined;
}

/** A command's argument as the node it stands for; any other value is taken as the node. */
export function nodeArgument(arg: unknown): unknown {
    return nodeOfRow(arg) ?? arg;
}

export interface NodeGroupOptions {
    readonly id: string;
    readonly order: number;
    /** The group row's label, such as "Resources". */
    readonly label: string;
    /** Keys the group's open state in the view's memory. */
    readonly groupId: string;
    /** The state a group starts in when the user hasn't opened or closed it. */
    readonly collapsibleState: TreeItemCollapsibleState;
    /** The group's nodes. With none, the group has no row. */
    readonly nodes: () => TreeNode[] | Promise<TreeNode[]>;
    readonly onDidChange?: Event<void>;
    readonly log: Logger;
}

/** The fields of a node that the shared row actions read (`databricks.utils.*`). */
const ROW_FIELDS = ["url", "copyText", "type", "sourceLocation"] as const;

/**
 * A section that renders a tree of nodes under one group row in the
 * Project view. Each row is a copy of the node's tree item, mapped back to
 * the node by `nodeOfRow`, with the fields the shared actions read.
 */
export class NodeGroupSection implements ConfigurationSection {
    readonly id: string;
    readonly order: number;
    readonly onDidChange?: Event<void>;
    private readonly group: ConfigurationItem;

    constructor(private readonly options: NodeGroupOptions) {
        this.id = options.id;
        this.order = options.order;
        this.onDidChange = options.onDidChange;
        this.group = {
            id: options.groupId,
            groupId: options.groupId,
            contextValue: `databricks.configuration.group.${options.groupId}`,
            label: options.label,
            collapsibleState: options.collapsibleState,
        };
    }

    async getChildren(parent?: ConfigurationItem): Promise<ConfigurationItem[]> {
        try {
            if (parent === undefined) {
                return (await this.options.nodes()).length > 0 ? [this.group] : [];
            }
            if (parent === this.group) {
                return await this.rows(await this.options.nodes());
            }
            const node = nodeOfRow(parent);
            return node === undefined ? [] : await this.rows((await node.getChildren?.()) ?? []);
        } catch (e) {
            this.options.log.error(`Failed to list the rows of ${this.options.label}`, e);
            return [];
        }
    }

    /** One node that fails to render is logged and left out, so it can't blank the group. */
    private async rows(children: TreeNode[]): Promise<ConfigurationItem[]> {
        const rows = await Promise.all(children.map((node) => this.row(node)));
        return rows.filter((row): row is ConfigurationItem => row !== undefined);
    }

    private async row(node: TreeNode): Promise<ConfigurationItem | undefined> {
        try {
            const fields = node as unknown as Record<string, unknown>;
            const copied = Object.fromEntries(
                ROW_FIELDS.filter((f) => f in fields).map((f) => [f, fields[f]]),
            );
            const row: ConfigurationItem = Object.assign({}, await node.getTreeItem(), copied);
            nodes.set(row, node);
            return row;
        } catch (e) {
            this.options.log.error(`Failed to render a row of ${this.options.label}`, e);
            return undefined;
        }
    }
}
