import * as assert from "assert";
import {TreeItemCollapsibleState} from "vscode";
import {TaskHeaderTreeNode} from "./TaskHeaderTreeNode";
import {BundleResourceExplorerTreeNode} from "./types";
import {TaskTreeNode} from "./TaskTreeNode";

function createMockParent(): BundleResourceExplorerTreeNode {
    return {
        type: "jobs" as any,
        getTreeItem: () => ({label: "mock-job"}),
        getChildren: () => [],
    };
}

function createMockTaskTreeNode(): TaskTreeNode {
    return {
        type: "task",
        getTreeItem: () => ({label: "mock-task"}),
        getChildren: () => [],
    } as unknown as TaskTreeNode;
}

describe("TaskHeaderTreeNode", () => {
    describe("getTreeItem", () => {
        it("should return Collapsed when there are children", () => {
            const parent = createMockParent();
            const tasks = [createMockTaskTreeNode()];
            const node = new TaskHeaderTreeNode(tasks, parent);

            const treeItem = node.getTreeItem();

            assert.strictEqual(
                treeItem.collapsibleState,
                TreeItemCollapsibleState.Collapsed
            );
        });

        it("should return Collapsed when there are multiple children", () => {
            const parent = createMockParent();
            const tasks = [
                createMockTaskTreeNode(),
                createMockTaskTreeNode(),
                createMockTaskTreeNode(),
            ];
            const node = new TaskHeaderTreeNode(tasks, parent);

            const treeItem = node.getTreeItem();

            assert.strictEqual(
                treeItem.collapsibleState,
                TreeItemCollapsibleState.Collapsed
            );
        });

        it("should return None when there are no children", () => {
            const parent = createMockParent();
            const node = new TaskHeaderTreeNode([], parent);

            const treeItem = node.getTreeItem();

            assert.strictEqual(
                treeItem.collapsibleState,
                TreeItemCollapsibleState.None
            );
        });

        it("should set the label to 'Tasks'", () => {
            const parent = createMockParent();
            const tasks = [createMockTaskTreeNode()];
            const node = new TaskHeaderTreeNode(tasks, parent);

            const treeItem = node.getTreeItem();

            assert.strictEqual(treeItem.label, "Tasks");
        });

        it("should set contextValue to 'task_header'", () => {
            const parent = createMockParent();
            const tasks = [createMockTaskTreeNode()];
            const node = new TaskHeaderTreeNode(tasks, parent);

            const treeItem = node.getTreeItem();

            assert.strictEqual(treeItem.contextValue, "task_header");
        });
    });

    describe("getChildren", () => {
        it("should return the task children", () => {
            const parent = createMockParent();
            const task1 = createMockTaskTreeNode();
            const task2 = createMockTaskTreeNode();
            const node = new TaskHeaderTreeNode([task1, task2], parent);

            const children = node.getChildren();

            assert.strictEqual(children.length, 2);
            assert.strictEqual(children[0], task1);
            assert.strictEqual(children[1], task2);
        });

        it("should return empty array when no children", () => {
            const parent = createMockParent();
            const node = new TaskHeaderTreeNode([], parent);

            const children = node.getChildren();

            assert.strictEqual(children.length, 0);
        });

        it("should set parent on task children to this node", () => {
            const parent = createMockParent();
            const task = createMockTaskTreeNode();
            const node = new TaskHeaderTreeNode([task], parent);

            assert.strictEqual(task.parent, node);
        });
    });
});
