import assert from "assert";
import {ExtensionContext} from "vscode";
import {StateStorage} from "./StateStorage";

class InMemoryMemento {
    private store = new Map<string, any>();
    get(key: string, defaultValue?: any) {
        return this.store.has(key) ? this.store.get(key) : defaultValue;
    }
    async update(key: string, value: any) {
        if (value === undefined) {
            this.store.delete(key);
        } else {
            this.store.set(key, value);
        }
    }
    keys() {
        return [...this.store.keys()];
    }
}

function createStorage() {
    const globalState = new InMemoryMemento();
    const workspaceState = new InMemoryMemento();
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
