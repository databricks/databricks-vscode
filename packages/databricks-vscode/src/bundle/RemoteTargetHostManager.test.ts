import assert from "assert";
import {Disposable} from "vscode";
import {
    ConfigModel,
    TargetWorkspaceHost,
} from "../configuration/models/ConfigModel";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {RemoteTargetHostManager} from "./RemoteTargetHostManager";

const ENV_HOST = new URL("https://dogfood.cloud.databricks.com");
const TARGET_HOST = new URL("https://logfood.cloud.databricks.com");

/**
 * Hand-rolled stand-in for {@link ConfigModel}: the base model exposes
 * `onDidChangeTarget` and `getTargetWorkspaceHost` as bound instance fields
 * ts-mockito can't stub, so we drive them directly. `fire()` replays a target
 * change and `fireHostChange()` an edit to the target's workspace.host.
 */
class FakeConfigModel {
    private listeners: Array<() => unknown> = [];
    private hostListeners: Array<() => unknown> = [];
    public target: string | undefined;
    public resolution: TargetWorkspaceHost = {kind: "session"};
    public getError: Error | undefined;

    /** Point the target at an explicit host, or (undefined) give it none. */
    setTargetHost(host: URL | undefined) {
        this.resolution =
            host === undefined ? {kind: "session"} : {kind: "host", host};
    }

    onDidChangeTarget(cb: () => unknown): Disposable {
        this.listeners.push(cb);
        return {dispose() {}};
    }

    onDidChangeKey() {
        return (cb: () => unknown): Disposable => {
            this.hostListeners.push(cb);
            return {dispose() {}};
        };
    }

    async getTargetWorkspaceHost(): Promise<TargetWorkspaceHost> {
        if (this.getError) {
            throw this.getError;
        }
        return this.resolution;
    }

    async fireHostChange(): Promise<void> {
        for (const cb of this.hostListeners) {
            await cb();
        }
    }

    async fire(): Promise<void> {
        for (const cb of this.listeners) {
            await cb();
        }
    }

    // Invoke the listener twice without awaiting between, so the second call
    // runs while the first is still awaiting the host — the concurrency the
    // manager must tolerate.
    async fireConcurrentTwice(): Promise<void> {
        await Promise.all(this.listeners.flatMap((cb) => [cb(), cb()]));
    }
}

/** Stand-in for {@link ConnectionManager}: exposes the two things the manager reads. */
class FakeConnectionManager {
    private listeners: Array<() => unknown> = [];
    public databricksWorkspace: {authProvider: {host: URL}} | undefined;

    onDidChangeState(cb: () => unknown): Disposable {
        this.listeners.push(cb);
        return {dispose() {}};
    }

    async fireStateChange(): Promise<void> {
        for (const cb of this.listeners) {
            await cb();
        }
    }

    setEnvHost(host: URL | undefined) {
        this.databricksWorkspace =
            host === undefined ? undefined : {authProvider: {host}};
    }
}

describe("RemoteTargetHostManager", () => {
    let fakeConfig: FakeConfigModel;
    let fakeConnection: FakeConnectionManager;

    function build(): {
        manager: RemoteTargetHostManager;
        changes: () => number;
    } {
        const manager = new RemoteTargetHostManager(
            fakeConfig as unknown as ConfigModel,
            fakeConnection as unknown as ConnectionManager
        );
        let count = 0;
        manager.onDidChangeMismatch(() => count++);
        return {manager, changes: () => count};
    }

    beforeEach(() => {
        fakeConfig = new FakeConfigModel();
        fakeConnection = new FakeConnectionManager();
    });

    it("detects a host mismatch and exposes it", async () => {
        const {manager, changes} = build();
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.setTargetHost(TARGET_HOST);

        await fakeConfig.fire();

        assert.deepStrictEqual(manager.mismatch, {
            envHost: ENV_HOST.hostname,
            targetHost: TARGET_HOST.hostname,
            target: "prod",
        });
        assert.strictEqual(changes(), 1);
    });

    it("does not flag when the hosts match (trailing-slash tolerant)", async () => {
        const {manager} = build();
        fakeConnection.setEnvHost(
            new URL("https://dogfood.cloud.databricks.com/")
        );
        fakeConfig.target = "dev";
        fakeConfig.setTargetHost(
            new URL("https://dogfood.cloud.databricks.com")
        );

        await fakeConfig.fire();

        assert.strictEqual(manager.mismatch, undefined);
    });

    it("does not flag when no target is selected", async () => {
        const {manager} = build();
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = undefined;
        fakeConfig.setTargetHost(TARGET_HOST);

        await fakeConfig.fire();

        assert.strictEqual(manager.mismatch, undefined);
    });

    it("does not flag when not connected (no environment host)", async () => {
        const {manager} = build();
        fakeConnection.setEnvHost(undefined);
        fakeConfig.target = "prod";
        fakeConfig.setTargetHost(TARGET_HOST);

        await fakeConfig.fire();

        assert.strictEqual(manager.mismatch, undefined);
    });

    it("does not flag a target with no host (the CLI uses the session host)", async () => {
        const {manager} = build();
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.resolution = {kind: "session"};

        await fakeConfig.fire();

        assert.strictEqual(manager.mismatch, undefined);
    });

    it("does not flag an unparseable host (invalid-host path owns it)", async () => {
        const {manager} = build();
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.resolution = {kind: "unresolved"};

        await fakeConfig.fire();

        assert.strictEqual(manager.mismatch, undefined);
    });

    it("re-evaluates when the target's workspace.host changes", async () => {
        const {manager, changes} = build();
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.setTargetHost(TARGET_HOST);

        await fakeConfig.fire();
        assert.notStrictEqual(manager.mismatch, undefined);

        // The user fixes workspace.host in databricks.yml; the target name
        // doesn't change, so only the host-key event fires.
        fakeConfig.setTargetHost(ENV_HOST);
        await fakeConfig.fireHostChange();
        assert.strictEqual(manager.mismatch, undefined);

        // Breaking it again flags again.
        fakeConfig.setTargetHost(TARGET_HOST);
        await fakeConfig.fireHostChange();
        assert.notStrictEqual(manager.mismatch, undefined);
        // set → clear → set is three distinct changes.
        assert.strictEqual(changes(), 3);
    });

    it("fires onDidChangeMismatch only when the mismatch changes", async () => {
        const {changes} = build();
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.setTargetHost(TARGET_HOST);

        await fakeConfig.fire();
        await fakeConfig.fireHostChange();
        await fakeConfig.fire();

        assert.strictEqual(changes(), 1);
    });

    it("clears the mismatch when the target clears, and restores it when it returns", async () => {
        const {manager} = build();
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.setTargetHost(TARGET_HOST);

        await fakeConfig.fire();
        assert.notStrictEqual(manager.mismatch, undefined);

        // A folder switch clears the target before resolving the new folder's.
        fakeConfig.target = undefined;
        await fakeConfig.fire();
        assert.strictEqual(manager.mismatch, undefined);

        // The new folder's target has the same mismatch: it shows again.
        fakeConfig.target = "prod";
        await fakeConfig.fire();
        assert.notStrictEqual(manager.mismatch, undefined);
    });

    it("clears the mismatch when the connection drops", async () => {
        const {manager} = build();
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.setTargetHost(TARGET_HOST);
        await fakeConfig.fire();
        assert.notStrictEqual(manager.mismatch, undefined);

        // A failed reconnect ends DISCONNECTED with no workspace.
        fakeConnection.setEnvHost(undefined);
        await fakeConnection.fireStateChange();

        assert.strictEqual(manager.mismatch, undefined);
    });

    it("clears the mismatch when evaluating it throws", async () => {
        const {manager} = build();
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.setTargetHost(TARGET_HOST);
        await fakeConfig.fire();
        assert.notStrictEqual(manager.mismatch, undefined);

        fakeConfig.getError = new Error("no config");
        await fakeConfig.fire();

        assert.strictEqual(manager.mismatch, undefined);
    });

    it("changes the mismatch only once when two evaluations overlap", async () => {
        const {manager, changes} = build();
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.setTargetHost(TARGET_HOST);

        await fakeConfig.fireConcurrentTwice();

        assert.notStrictEqual(manager.mismatch, undefined);
        assert.strictEqual(changes(), 1);
    });
});
