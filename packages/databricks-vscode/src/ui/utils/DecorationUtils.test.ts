import * as assert from "assert";
import {TreeItemCollapsibleState} from "vscode";
import {getCollapsibleState} from "./DecorationUtils";

describe("DecorationUtils", () => {
    describe("getCollapsibleState", () => {
        it("should return None when modifiedStatus is 'deleted'", () => {
            const result = getCollapsibleState(false, "deleted");
            assert.strictEqual(result, TreeItemCollapsibleState.None);
        });

        it("should return None when modifiedStatus is 'deleted' even if running", () => {
            const result = getCollapsibleState(true, "deleted");
            assert.strictEqual(result, TreeItemCollapsibleState.None);
        });

        it("should return Collapsed when isRunning is true and not deleted", () => {
            const result = getCollapsibleState(true, undefined);
            assert.strictEqual(result, TreeItemCollapsibleState.Collapsed);
        });

        it("should return Collapsed when isRunning is true with 'created' status", () => {
            const result = getCollapsibleState(true, "created");
            assert.strictEqual(result, TreeItemCollapsibleState.Collapsed);
        });

        it("should return Collapsed when isRunning is true with 'updated' status", () => {
            const result = getCollapsibleState(true, "updated");
            assert.strictEqual(result, TreeItemCollapsibleState.Collapsed);
        });

        it("should return Collapsed when not running and no modifiedStatus", () => {
            const result = getCollapsibleState(false, undefined);
            assert.strictEqual(result, TreeItemCollapsibleState.Collapsed);
        });

        it("should return Collapsed when not running with 'created' status", () => {
            const result = getCollapsibleState(false, "created");
            assert.strictEqual(result, TreeItemCollapsibleState.Collapsed);
        });

        it("should return Collapsed when not running with 'updated' status", () => {
            const result = getCollapsibleState(false, "updated");
            assert.strictEqual(result, TreeItemCollapsibleState.Collapsed);
        });
    });
});
