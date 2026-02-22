import * as assert from "assert";
import {TreeItemCollapsibleState, ExtensionContext} from "vscode";
import {ResourceTypeHeaderTreeNode} from "./ResourceTypeHeaderTreeNode";
import {BundleResourceExplorerTreeNode} from "./types";

function createMockContext(): ExtensionContext {
    return {
        asAbsolutePath: (relativePath: string) =>
            `/mock/extension/${relativePath}`,
    } as unknown as ExtensionContext;
}

function createMockChild(
    type: string = "jobs"
): BundleResourceExplorerTreeNode {
    return {
        type: type as any,
        getTreeItem: () => ({label: "mock"}),
        getChildren: () => [],
    };
}

describe("ResourceTypeHeaderTreeNode", () => {
    describe("getTreeItem", () => {
        it("should return Collapsed collapsible state for 'jobs' header", () => {
            const context = createMockContext();
            const children = [createMockChild("jobs")];
            const node = new ResourceTypeHeaderTreeNode(
                context,
                "jobs",
                children
            );

            const treeItem = node.getTreeItem();

            assert.strictEqual(
                treeItem.collapsibleState,
                TreeItemCollapsibleState.Collapsed
            );
        });

        it("should return Collapsed collapsible state for 'pipelines' header", () => {
            const context = createMockContext();
            const children = [createMockChild("pipelines")];
            const node = new ResourceTypeHeaderTreeNode(
                context,
                "pipelines",
                children
            );

            const treeItem = node.getTreeItem();

            assert.strictEqual(
                treeItem.collapsibleState,
                TreeItemCollapsibleState.Collapsed
            );
        });

        it("should set the label to 'Jobs' for jobs resource type", () => {
            const context = createMockContext();
            const children = [createMockChild("jobs")];
            const node = new ResourceTypeHeaderTreeNode(
                context,
                "jobs",
                children
            );

            const treeItem = node.getTreeItem();

            assert.strictEqual(treeItem.label, "Jobs");
        });

        it("should set the label to 'Pipelines' for pipelines resource type", () => {
            const context = createMockContext();
            const children = [createMockChild("pipelines")];
            const node = new ResourceTypeHeaderTreeNode(
                context,
                "pipelines",
                children
            );

            const treeItem = node.getTreeItem();

            assert.strictEqual(treeItem.label, "Pipelines");
        });
    });

    describe("getChildren", () => {
        it("should return the children passed in the constructor", () => {
            const context = createMockContext();
            const child1 = createMockChild("jobs");
            const child2 = createMockChild("jobs");
            const node = new ResourceTypeHeaderTreeNode(context, "jobs", [
                child1,
                child2,
            ]);

            const children = node.getChildren();

            assert.strictEqual(children.length, 2);
            assert.strictEqual(children[0], child1);
            assert.strictEqual(children[1], child2);
        });

        it("should set parent on children", () => {
            const context = createMockContext();
            const child = createMockChild("jobs");
            const node = new ResourceTypeHeaderTreeNode(context, "jobs", [
                child,
            ]);

            assert.strictEqual(child.parent, node);
        });
    });
});
