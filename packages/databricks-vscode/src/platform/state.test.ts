import { describe, expect, it } from "vitest";
import { fakeMemento } from "../test-support/fakes";
import { stateKey, StateStore } from "./state";

interface SetupState {
    envKey: string;
    pythonVersion: string;
}

const SETUP_STATE = stateKey<SetupState | undefined>(
    "databricks.pythonSetup.setupState",
    "workspace",
    undefined,
);
const FAVORITES = stateKey<string[]>("databricks.test.favorites", "global", []);

function createStore() {
    const global = fakeMemento();
    const workspace = fakeMemento();
    return { store: new StateStore({ global, workspace }), global, workspace };
}

describe("StateStore", () => {
    it("round-trips a value", async () => {
        const { store } = createStore();
        const value = { envKey: "serverless/serverless-v5", pythonVersion: "3.12" };
        await store.set(SETUP_STATE, value);
        expect(store.get(SETUP_STATE)).toEqual(value);
    });

    it("returns the default before anything is persisted", () => {
        const { store } = createStore();
        expect(store.get(SETUP_STATE)).toBeUndefined();
        expect(store.get(FAVORITES)).toEqual([]);
    });

    it("clears the value when set to undefined", async () => {
        const { store, workspace } = createStore();
        await store.set(SETUP_STATE, { envKey: "cluster/0101", pythonVersion: "3.11" });
        await store.set(SETUP_STATE, undefined);
        expect(store.get(SETUP_STATE)).toBeUndefined();
        expect(workspace.store.has(SETUP_STATE.name)).toBe(false);
    });

    it("writes to the key's location under the key's name", async () => {
        const { store, global, workspace } = createStore();
        await store.set(SETUP_STATE, { envKey: "e", pythonVersion: "3.12" });
        await store.set(FAVORITES, ["a"]);
        expect([...workspace.store.keys()]).toEqual(["databricks.pythonSetup.setupState"]);
        expect([...global.store.keys()]).toEqual(["databricks.test.favorites"]);
    });

    it("returns copies, so callers can't mutate the stored value", async () => {
        const { store } = createStore();
        await store.set(FAVORITES, ["a"]);
        store.get(FAVORITES).push("b");
        expect(store.get(FAVORITES)).toEqual(["a"]);
        // Nor does mutating the default leak into later reads.
        const { store: fresh } = createStore();
        fresh.get(FAVORITES).push("x");
        expect(fresh.get(FAVORITES)).toEqual([]);
    });

    it("fires onDidChange only when the value changes", async () => {
        const { store } = createStore();
        let fired = 0;
        store.onDidChange(FAVORITES)(() => fired++);
        await store.set(FAVORITES, ["a"]);
        await store.set(FAVORITES, ["a"]);
        await store.set(FAVORITES, ["b"]);
        expect(fired).toBe(2);
    });

    it("applies concurrent writes in call order", async () => {
        const { store } = createStore();
        await Promise.all([
            store.set(FAVORITES, ["1"]),
            store.set(FAVORITES, ["2"]),
            store.set(FAVORITES, ["3"]),
        ]);
        expect(store.get(FAVORITES)).toEqual(["3"]);
    });

    it("keeps writing after a failed write", async () => {
        const global = fakeMemento();
        const failing = { ...global, update: async () => Promise.reject(new Error("disk full")) };
        const store = new StateStore({ global: failing, workspace: fakeMemento() });
        await expect(store.set(FAVORITES, ["a"])).rejects.toThrow("disk full");
        await expect(
            store.set(SETUP_STATE, { envKey: "e", pythonVersion: "3" }),
        ).resolves.toBeUndefined();
    });
});
