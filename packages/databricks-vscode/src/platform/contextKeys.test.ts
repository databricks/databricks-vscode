import { describe, expect, it } from "vitest";
import { contextKey, ContextKeys } from "./contextKeys";

describe("ContextKeys", () => {
    const KEY = contextKey<boolean>("databricks.context.test");

    it("sets the context once per distinct value", async () => {
        const calls: [string, unknown][] = [];
        const keys = new ContextKeys(async (name, value) => calls.push([name, value]));
        await keys.set(KEY, true);
        await keys.set(KEY, true);
        await keys.set(KEY, false);
        expect(calls).toEqual([
            ["databricks.context.test", true],
            ["databricks.context.test", false],
        ]);
        expect(keys.get(KEY)).toBe(false);
    });
});
