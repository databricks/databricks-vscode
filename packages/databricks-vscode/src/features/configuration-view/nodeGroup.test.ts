import { describe, expect, it } from "vitest";
import { TreeItemCollapsibleState } from "vscode";
import type { TreeNode } from "../../platform/ui/tree";
import { NodeGroupSection, nodeArgument, nodeOfRow } from "../../platform/ui/nodeGroup";
import { fakeLog } from "../../test-support/fakes";

class Leaf implements TreeNode {
    readonly type = "leaf";
    readonly url = "https://example.com/leaf";
    constructor(
        readonly label: string,
        private readonly kids: TreeNode[] = [],
    ) {}
    getTreeItem() {
        return { label: this.label, collapsibleState: TreeItemCollapsibleState.Collapsed };
    }
    getChildren() {
        return this.kids;
    }
}

function group(nodes: TreeNode[]) {
    return new NodeGroupSection({
        id: "test",
        order: 80,
        label: "Resources",
        groupId: "resources",
        collapsibleState: TreeItemCollapsibleState.Expanded,
        nodes: () => nodes,
        log: fakeLog(),
    });
}

describe("NodeGroupSection", () => {
    it("has no rows when it has no nodes", async () => {
        expect(await group([]).getChildren()).toEqual([]);
    });

    it("renders one group row, then the nodes under it, and the nodes' children under those", async () => {
        const child = new Leaf("child");
        const section = group([new Leaf("parent", [child])]);
        const [row] = await section.getChildren();
        expect(row).toMatchObject({
            label: "Resources",
            groupId: "resources",
            contextValue: "databricks.configuration.group.resources",
            collapsibleState: TreeItemCollapsibleState.Expanded,
        });
        const [parent] = await section.getChildren(row);
        expect(parent).toMatchObject({ label: "parent", url: "https://example.com/leaf" });
        const [grandchild] = await section.getChildren(parent);
        expect(grandchild).toMatchObject({ label: "child" });
    });

    it("leaves out a row that fails to render, and keeps the others", async () => {
        const log = fakeLog();
        const broken: TreeNode = {
            getTreeItem() {
                throw new Error("boom");
            },
        };
        const section = new NodeGroupSection({
            id: "test",
            order: 80,
            label: "Resources",
            groupId: "resources",
            collapsibleState: TreeItemCollapsibleState.Expanded,
            nodes: () => [broken, new Leaf("ok")],
            log,
        });
        const [group] = await section.getChildren();
        const rows = await section.getChildren(group);
        expect(rows.map((r) => r.label)).toEqual(["ok"]);
        expect(log.entries.filter((e) => e.level === "error")).toHaveLength(1);
    });

    it("maps each row back to its node, which is what an action on the row gets", async () => {
        const node = new Leaf("parent");
        const section = group([node]);
        const [row] = await section.getChildren();
        const [parent] = await section.getChildren(row);
        expect(nodeOfRow(parent)).toBe(node);
        expect(nodeArgument(parent)).toBe(node);
        // Anything else is the argument itself.
        expect(nodeArgument(node)).toBe(node);
        expect(nodeOfRow(row)).toBeUndefined();
    });
});
