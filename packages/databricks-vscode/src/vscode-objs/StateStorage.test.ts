import {expect} from "chai";
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

function makeStorage(): StateStorage {
    const context = {
        workspaceState: fakeMemento(),
        globalState: fakeMemento(),
    } as unknown as ExtensionContext;
    return new StateStorage(context);
}

describe("StateStorage python-setup setup state", () => {
    it("round-trips the persisted setup state", async () => {
        const storage = makeStorage();
        const state: PythonSetupState = {
            envKey: "serverless/serverless-v5",
            pythonVersion: "3.12",
            timestamp: "2026-07-27T10:00:00.000Z",
        };

        await storage.set("databricks.pythonSetup.setupState", state);

        expect(storage.get("databricks.pythonSetup.setupState")).to.deep.equal(
            state
        );
    });

    it("returns undefined before anything is persisted", () => {
        expect(makeStorage().get("databricks.pythonSetup.setupState")).to.equal(
            undefined
        );
    });

    it("clears the state when set to undefined", async () => {
        const storage = makeStorage();
        await storage.set("databricks.pythonSetup.setupState", {
            envKey: "cluster/0101",
            pythonVersion: "3.11",
            timestamp: "2026-07-27T10:00:00.000Z",
        });

        await storage.set("databricks.pythonSetup.setupState", undefined);

        expect(storage.get("databricks.pythonSetup.setupState")).to.equal(
            undefined
        );
    });

    it("is stored in workspace state (per-project), not global", async () => {
        const workspaceState = fakeMemento();
        const globalState = fakeMemento();
        const storage = new StateStorage({
            workspaceState,
            globalState,
        } as unknown as ExtensionContext);

        await storage.set("databricks.pythonSetup.setupState", {
            envKey: "serverless/serverless-v5",
            pythonVersion: "3.12",
            timestamp: "2026-07-27T10:00:00.000Z",
        });

        expect(
            workspaceState.get("databricks.pythonSetup.setupState")
        ).to.not.equal(undefined);
        expect(globalState.get("databricks.pythonSetup.setupState")).to.equal(
            undefined
        );
    });
});
