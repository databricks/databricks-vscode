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

describe(__filename, () => {
    it("enumerates all storage keys with their location", () => {
        const {storage} = createStorage();
        const keys = storage.storageKeys;

        const hideInstallPrompt = keys.find(
            (k) => k.key === "databricks.aitools.hideInstallPrompt"
        );
        assert.strictEqual(hideInstallPrompt?.location, "global");

        const bundleTarget = keys.find(
            (k) => k.key === "databricks.bundle.target"
        );
        assert.strictEqual(bundleTarget?.location, "workspace");
    });

    it("reset clears the stored value so get returns the default", async () => {
        const {storage, globalState} = createStorage();

        await storage.set("databricks.aitools.hideInstallPrompt", true);
        assert.strictEqual(
            storage.get("databricks.aitools.hideInstallPrompt"),
            true
        );

        await storage.reset("databricks.aitools.hideInstallPrompt");

        // Raw entry removed, and get falls back to the configured default.
        assert.strictEqual(
            globalState.get("databricks.aitools.hideInstallPrompt"),
            undefined
        );
        assert.strictEqual(
            storage.get("databricks.aitools.hideInstallPrompt"),
            false
        );
    });

    it("reset targets the correct state object by location", async () => {
        const {storage, workspaceState} = createStorage();

        await storage.set("databricks.bundle.target", "dev");
        assert.strictEqual(
            workspaceState.get("databricks.bundle.target"),
            "dev"
        );

        await storage.reset("databricks.bundle.target");
        assert.strictEqual(
            workspaceState.get("databricks.bundle.target"),
            undefined
        );
    });
});

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
