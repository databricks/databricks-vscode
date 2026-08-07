import assert from "assert";
import {AiToolsAgentStatus, AiToolsModel} from "./AiToolsModel";

function agent(id: string, version?: string): AiToolsAgentStatus {
    return {
        id,
        displayName: id,
        type: version !== undefined ? "plugin" : "skills-only",
        detected: version !== undefined,
        version,
    };
}

describe(__filename, () => {
    it("seeds the state from the given install location", () => {
        const model = new AiToolsModel("project");
        assert.deepStrictEqual(model.state, {
            installLocation: "project",
            updateStatus: "unknown",
            version: undefined,
            detectError: false,
            agents: [],
        });
        assert.strictEqual(model.installLocation, "project");
        assert.strictEqual(model.isInstalled, true);
    });

    it("reports not installed when seeded with no location", () => {
        const model = new AiToolsModel(undefined);
        assert.strictEqual(model.installLocation, undefined);
        assert.strictEqual(model.isInstalled, false);
    });

    it("merges a partial patch into the existing state", () => {
        const model = new AiToolsModel("project");
        model.update({updateStatus: "checking"});
        model.update({version: "0.2.9", agents: [agent("codex", "0.2.9")]});

        // The earlier updateStatus survives the later patch (merge, not replace).
        assert.strictEqual(model.state.updateStatus, "checking");
        assert.strictEqual(model.state.version, "0.2.9");
        assert.strictEqual(model.state.installLocation, "project");
        assert.deepStrictEqual(model.state.agents, [agent("codex", "0.2.9")]);
    });

    it("fires onDidChange once per update", () => {
        const model = new AiToolsModel(undefined);
        let fired = 0;
        model.onDidChange(() => fired++);

        model.update({installLocation: "global"});
        model.update({updateStatus: "upToDate"});

        assert.strictEqual(fired, 2);
        assert.strictEqual(model.installLocation, "global");
    });

    it("returns a fresh snapshot object each read", () => {
        const model = new AiToolsModel("project");
        assert.notStrictEqual(model.state, model.state);

        // Reassigning a field on the snapshot must not leak back into the model.
        const snapshot = model.state;
        snapshot.installLocation = "global";
        assert.strictEqual(model.state.installLocation, "project");
    });

    it("stops firing after dispose", () => {
        const model = new AiToolsModel(undefined);
        let fired = 0;
        model.onDidChange(() => fired++);
        model.dispose();

        // The emitter is disposed; listeners no longer receive events.
        model.update({updateStatus: "error"});
        assert.strictEqual(fired, 0);
    });
});
