import { describe, expect, it } from "vitest";
import { StateStore } from "../../../../platform/state";
import { fakeMemento } from "../../../../test-support/fakes";
import { LEGACY_SETUP_STATE, SETUP_STATES, SetupStates } from "./SetupStates";

const A = "/ws/a";
const B = "/ws/b";
const v4 = {
    envKey: "serverless/serverless-v4",
    pythonVersion: "3.12",
    timestamp: "2026-10-01T00:00:00.000Z",
};
const v5 = {
    envKey: "serverless/serverless-v5",
    pythonVersion: "3.12",
    timestamp: "2026-10-02T00:00:00.000Z",
};

function setup(options: { legacy?: typeof v4; folders?: number } = {}) {
    const workspace = fakeMemento();
    if (options.legacy !== undefined) {
        workspace.store.set(LEGACY_SETUP_STATE.name, options.legacy);
    }
    const store = new StateStore({ global: fakeMemento(), workspace });
    let folders = options.folders ?? 1;
    const states = new SetupStates(store, () => folders);
    return { states, workspace, setFolders: (n: number) => (folders = n) };
}

describe("SetupStates", () => {
    it("keeps one setup per project", async () => {
        const { states } = setup();
        expect(states.get(A)).to.equal(undefined);
        await states.set(A, v4);
        await states.set(B, v5);
        expect(states.get(A)).to.deep.equal(v4);
        expect(states.get(B)).to.deep.equal(v5);
    });

    it("reads the old window-wide key in a window with one folder", () => {
        const { states } = setup({ legacy: v4 });
        expect(states.get(A)).to.deep.equal(v4);
    });

    it("reads the old key in a window without folders", () => {
        const { states } = setup({ legacy: v4, folders: 0 });
        expect(states.get(A)).to.deep.equal(v4);
    });

    it("ignores the old key with several folders: it may be a sibling's", async () => {
        const { states, workspace } = setup({ legacy: v4, folders: 2 });
        expect(states.get(A)).to.equal(undefined);
        await states.set(B, v5);
        expect(workspace.store.get(SETUP_STATES.name)).to.deep.equal({ [B]: v5 });
    });

    it("copies the old value into the first write, for the project it was read for, and never writes the old key", async () => {
        const { states, workspace } = setup({ legacy: v4 });
        expect(states.get(A)).to.deep.equal(v4);
        await states.set(B, v5);
        expect(workspace.store.get(SETUP_STATES.name)).to.deep.equal({ [A]: v4, [B]: v5 });
        expect(states.get(A)).to.deep.equal(v4);
        expect(workspace.store.get(LEGACY_SETUP_STATE.name)).to.deep.equal(v4);
    });

    it("lets the first write replace the old value for its own project", async () => {
        const { states, workspace } = setup({ legacy: v4 });
        await states.set(A, v5);
        expect(workspace.store.get(SETUP_STATES.name)).to.deep.equal({ [A]: v5 });
    });

    it("stops reading the old key once migrated", async () => {
        const { states } = setup({ legacy: v4 });
        await states.set(A, v5);
        // Another project in the same window no longer sees the old value.
        expect(states.get(B)).to.equal(undefined);
        expect(states.get(A)).to.deep.equal(v5);
    });

    it("fires onDidChange on a write", async () => {
        const { states } = setup();
        let fired = 0;
        states.onDidChange(() => fired++);
        await states.set(A, v4);
        expect(fired).to.equal(1);
    });
});
