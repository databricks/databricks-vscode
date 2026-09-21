import assert from "assert";
import {ExtensionContext, Memento} from "vscode";
import {PythonSetupState, StateStorage} from "./StateStorage";

/** Minimal in-memory Memento so StateStorage can be exercised off-host. */
function fakeMemento(): Memento {
    const store = new Map<string, unknown>();
    return {
        keys: () => [...store.keys()],
        get: <T>(key: string, defaultValue?: T) =>
            (store.has(key) ? store.get(key) : defaultValue) as T,
        update: async (key: string, value: unknown) => {
            if (value === undefined) {
                store.delete(key);
            } else {
                store.set(key, value);
            }
        },
    } as Memento;
}

function createStorage() {
    const globalState = fakeMemento();
    const workspaceState = fakeMemento();
    const context = {
        globalState,
        workspaceState,
    } as unknown as ExtensionContext;
    return {storage: new StateStorage(context), globalState, workspaceState};
}

describe("StateStorage python-setup setup state", () => {
    it("round-trips the persisted setup state", async () => {
        const {storage} = createStorage();
        const state: PythonSetupState = {
            envKey: "serverless/serverless-v5",
            pythonVersion: "3.12",
            timestamp: "2026-07-27T10:00:00.000Z",
        };

        await storage.set("databricks.pythonSetup.setupState", state);

        assert.deepStrictEqual(
            storage.get("databricks.pythonSetup.setupState"),
            state
        );
    });

    it("returns undefined before anything is persisted", () => {
        const {storage} = createStorage();
        assert.strictEqual(
            storage.get("databricks.pythonSetup.setupState"),
            undefined
        );
    });

    it("clears the state when set to undefined", async () => {
        const {storage} = createStorage();
        await storage.set("databricks.pythonSetup.setupState", {
            envKey: "cluster/0101",
            pythonVersion: "3.11",
            timestamp: "2026-07-27T10:00:00.000Z",
        });

        await storage.set("databricks.pythonSetup.setupState", undefined);

        assert.strictEqual(
            storage.get("databricks.pythonSetup.setupState"),
            undefined
        );
    });

    it("is stored in workspace state (per-project), not global", async () => {
        const {storage, globalState, workspaceState} = createStorage();

        await storage.set("databricks.pythonSetup.setupState", {
            envKey: "serverless/serverless-v5",
            pythonVersion: "3.12",
            timestamp: "2026-07-27T10:00:00.000Z",
        });

        assert.notStrictEqual(
            workspaceState.get("databricks.pythonSetup.setupState"),
            undefined
        );
        assert.strictEqual(
            globalState.get("databricks.pythonSetup.setupState"),
            undefined
        );
    });
});
