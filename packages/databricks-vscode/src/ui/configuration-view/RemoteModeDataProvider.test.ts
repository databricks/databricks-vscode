import assert from "assert";
import {RemoteModeDataProvider} from "./RemoteModeDataProvider";

describe("RemoteModeDataProvider", () => {
    it("returns three root items when venv path is set", () => {
        const provider = new RemoteModeDataProvider("/usr/bin/python3");
        const items = provider.getChildren(undefined);

        assert.strictEqual(items.length, 3);
        assert.ok(
            String(items[0].label).includes("Databricks Remote SSH Mode")
        );
        assert.ok(String(items[1].label).includes("Python environment"));
        assert.strictEqual(items[1].description, "/usr/bin/python3");
        assert.ok(String(items[2].label).includes("More features"));
    });

    it("shows 'not found' description when venv path is undefined", () => {
        const provider = new RemoteModeDataProvider(undefined);
        const items = provider.getChildren(undefined);

        assert.strictEqual(items.length, 3);
        assert.strictEqual(items[1].description, "not found");
    });

    it("returns no children for a tree item", () => {
        const provider = new RemoteModeDataProvider("/usr/bin/python3");
        const roots = provider.getChildren(undefined);
        const children = provider.getChildren(roots[0]);

        assert.deepStrictEqual(children, []);
    });

    it("getTreeItem returns the element unchanged", () => {
        const provider = new RemoteModeDataProvider("/usr/bin/python3");
        const items = provider.getChildren(undefined);
        const item = items[0];
        assert.strictEqual(provider.getTreeItem(item), item);
    });
});
