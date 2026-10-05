import assert from "assert";
import {Disposable} from "vscode";
import {
    anything,
    deepEqual,
    instance,
    mock,
    reset,
    verify,
    when,
} from "ts-mockito";
import {StateStorage} from "../vscode-objs/StateStorage";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {HostMismatch, RemoteTargetHostManager} from "./RemoteTargetHostManager";

const ALLOWED_KEY = "databricks.bundle.remote.allowedHostMismatches";

const ENV_HOST = new URL("https://dogfood.cloud.databricks.com");
const TARGET_HOST = new URL("https://logfood.cloud.databricks.com");
const OTHER_HOST = new URL("https://staging.cloud.databricks.com");
const PAIR = `${ENV_HOST.hostname}->${TARGET_HOST.hostname}`;

/**
 * Hand-rolled stand-in for {@link ConfigModel}: the base model exposes
 * `onDidChangeTarget` and `get` as bound instance fields ts-mockito can't stub,
 * so we drive them directly. `fire()` replays a target change and
 * `fireHostChange()` an edit to the target's workspace.host.
 */
class FakeConfigModel {
    private listeners: Array<() => unknown> = [];
    private hostListeners: Array<() => unknown> = [];
    public target: string | undefined;
    public hostToReturn: URL | undefined;

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

    async fireHostChange(): Promise<void> {
        for (const cb of this.hostListeners) {
            await cb();
        }
    }

    public getError: Error | undefined;

    async get(): Promise<URL | undefined> {
        if (this.getError) {
            throw this.getError;
        }
        return this.hostToReturn;
    }

    async fire(): Promise<void> {
        for (const cb of this.listeners) {
            await cb();
        }
    }

    // Invoke the listener twice without awaiting between, so the second call
    // runs while the first is still awaiting get() — the concurrency the
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
    let mockStorage: StateStorage;

    // Builds the manager and records every warning it asks for.
    function build(): {
        manager: RemoteTargetHostManager;
        warned: HostMismatch[];
    } {
        const manager = new RemoteTargetHostManager(
            fakeConfig as unknown as ConfigModel,
            fakeConnection as unknown as ConnectionManager,
            instance(mockStorage)
        );
        const warned: HostMismatch[] = [];
        manager.onDidDetectNewMismatch((m) => warned.push(m));
        return {manager, warned};
    }

    beforeEach(() => {
        fakeConfig = new FakeConfigModel();
        fakeConnection = new FakeConnectionManager();
        mockStorage = mock(StateStorage);
        when(mockStorage.get(ALLOWED_KEY)).thenReturn([]);
    });

    afterEach(() => {
        reset(mockStorage);
    });

    it("warns once on a host mismatch and exposes it", async () => {
        const {manager, warned} = build();
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.hostToReturn = TARGET_HOST;

        await fakeConfig.fire();

        const expected = {
            envHost: ENV_HOST.hostname,
            targetHost: TARGET_HOST.hostname,
            target: "prod",
            allowed: false,
        };
        assert.deepStrictEqual(warned, [expected]);
        assert.deepStrictEqual(manager.mismatch, expected);
    });

    it("does not warn when the hosts match (trailing-slash tolerant)", async () => {
        const {manager, warned} = build();
        fakeConnection.setEnvHost(
            new URL("https://dogfood.cloud.databricks.com/")
        );
        fakeConfig.target = "dev";
        fakeConfig.hostToReturn = new URL(
            "https://dogfood.cloud.databricks.com"
        );

        await fakeConfig.fire();

        assert.strictEqual(warned.length, 0);
        assert.strictEqual(manager.mismatch, undefined);
    });

    it("does not warn when no target is selected", async () => {
        const {manager, warned} = build();
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = undefined;
        fakeConfig.hostToReturn = TARGET_HOST;

        await fakeConfig.fire();

        assert.strictEqual(warned.length, 0);
        assert.strictEqual(manager.mismatch, undefined);
    });

    it("does not warn when not connected (no environment host)", async () => {
        const {warned} = build();
        fakeConnection.setEnvHost(undefined);
        fakeConfig.target = "prod";
        fakeConfig.hostToReturn = TARGET_HOST;

        await fakeConfig.fire();

        assert.strictEqual(warned.length, 0);
    });

    it("does not warn when the target host is undefined (invalid-host path owns it)", async () => {
        const {manager, warned} = build();
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.hostToReturn = undefined;

        await fakeConfig.fire();

        assert.strictEqual(warned.length, 0);
        assert.strictEqual(manager.mismatch, undefined);
    });

    it("warns once per pair, and again for a new pair", async () => {
        const {warned} = build();
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.hostToReturn = TARGET_HOST;

        await fakeConfig.fire();
        await fakeConfig.fire();
        await fakeConfig.fire();
        assert.strictEqual(warned.length, 1);

        // A target on a different host is a new pair and re-warns.
        fakeConfig.hostToReturn = OTHER_HOST;
        await fakeConfig.fire();
        assert.strictEqual(warned.length, 2);
    });

    it("warns once per pair when switching between two mismatched targets", async () => {
        const {warned} = build();
        fakeConnection.setEnvHost(ENV_HOST);

        for (const [target, host] of [
            ["a", TARGET_HOST],
            ["b", OTHER_HOST],
            ["a", TARGET_HOST],
            ["b", OTHER_HOST],
        ] as const) {
            fakeConfig.target = target;
            fakeConfig.hostToReturn = host;
            await fakeConfig.fire();
        }

        assert.deepStrictEqual(
            warned.map((m) => m.target),
            ["a", "b"]
        );
    });

    it("re-warns when the hosts match in between", async () => {
        const {warned} = build();
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.hostToReturn = TARGET_HOST;

        await fakeConfig.fire();
        assert.strictEqual(warned.length, 1);

        fakeConfig.hostToReturn = ENV_HOST;
        await fakeConfig.fire();
        assert.strictEqual(warned.length, 1);

        fakeConfig.hostToReturn = TARGET_HOST;
        await fakeConfig.fire();
        assert.strictEqual(warned.length, 2);
    });

    it("does not re-warn when the target clears transiently", async () => {
        const {manager, warned} = build();
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.hostToReturn = TARGET_HOST;

        await fakeConfig.fire();
        assert.strictEqual(warned.length, 1);

        // A folder switch clears the target before resolving the new folder's.
        fakeConfig.target = undefined;
        await fakeConfig.fire();
        assert.strictEqual(manager.mismatch, undefined);

        // The new folder's target has the same mismatch: no second warning.
        fakeConfig.target = "prod";
        await fakeConfig.fire();
        assert.strictEqual(warned.length, 1);
        assert.notStrictEqual(manager.mismatch, undefined);
    });

    it("re-evaluates when the target's workspace.host changes", async () => {
        const {manager, warned} = build();
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.hostToReturn = TARGET_HOST;

        await fakeConfig.fire();
        assert.notStrictEqual(manager.mismatch, undefined);

        // The user fixes workspace.host in databricks.yml; the target name
        // doesn't change, so only the host-key event fires.
        fakeConfig.hostToReturn = ENV_HOST;
        await fakeConfig.fireHostChange();
        assert.strictEqual(manager.mismatch, undefined);

        // Breaking it again warns again.
        fakeConfig.hostToReturn = TARGET_HOST;
        await fakeConfig.fireHostChange();
        assert.notStrictEqual(manager.mismatch, undefined);
        assert.strictEqual(warned.length, 2);
    });

    it("fires onDidChangeMismatch only when the mismatch changes", async () => {
        const {manager} = build();
        let changes = 0;
        manager.onDidChangeMismatch(() => changes++);
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.hostToReturn = TARGET_HOST;

        await fakeConfig.fire();
        await fakeConfig.fireHostChange();
        await fakeConfig.fire();

        assert.strictEqual(changes, 1);
    });

    it("doesn't warn for an allowed pair, but still for a different pair", async () => {
        when(mockStorage.get(ALLOWED_KEY)).thenReturn([PAIR]);
        const {manager, warned} = build();
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.hostToReturn = TARGET_HOST;

        await fakeConfig.fire();
        assert.strictEqual(warned.length, 0);
        // The badge still shows for an allowed pair.
        assert.strictEqual(manager.mismatch?.allowed, true);

        fakeConfig.hostToReturn = OTHER_HOST;
        await fakeConfig.fire();
        assert.strictEqual(warned.length, 1);
        assert.strictEqual(manager.mismatch?.allowed, false);
    });

    it("allowing persists the pair, fires onDidChangeAllowedHosts and updates the mismatch", async () => {
        let stored: string[] = [];
        when(mockStorage.get(ALLOWED_KEY)).thenCall(() => stored);
        when(mockStorage.set(ALLOWED_KEY, anything())).thenCall(
            async (_key: string, value: string[]) => {
                stored = value;
            }
        );
        const {manager} = build();
        let allowedChanges = 0;
        manager.onDidChangeAllowedHosts(() => allowedChanges++);
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.hostToReturn = TARGET_HOST;
        await fakeConfig.fire();

        await manager.setSessionCredentialsAllowed(manager.mismatch!, true);

        assert.deepStrictEqual(stored, [PAIR]);
        assert.strictEqual(allowedChanges, 1);
        assert.strictEqual(manager.mismatch?.allowed, true);
        assert.strictEqual(
            manager.allowsSessionCredentials(ENV_HOST, TARGET_HOST),
            true
        );
    });

    it("revoking removes only that pair", async () => {
        const otherPair = `${ENV_HOST.hostname}->${OTHER_HOST.hostname}`;
        when(mockStorage.get(ALLOWED_KEY)).thenReturn([PAIR, otherPair]);
        const {manager} = build();

        await manager.setSessionCredentialsAllowed(
            {
                envHost: ENV_HOST.hostname,
                targetHost: TARGET_HOST.hostname,
                target: "prod",
                allowed: true,
            },
            false
        );

        verify(mockStorage.set(ALLOWED_KEY, deepEqual([otherPair]))).once();
    });

    it("clears the mismatch when the connection drops", async () => {
        const {manager} = build();
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.hostToReturn = TARGET_HOST;
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
        fakeConfig.hostToReturn = TARGET_HOST;
        await fakeConfig.fire();
        assert.notStrictEqual(manager.mismatch, undefined);

        fakeConfig.getError = new Error("no config");
        await fakeConfig.fire();

        assert.strictEqual(manager.mismatch, undefined);
    });

    it("warns only once when two concurrent evaluations read the same mismatch", async () => {
        const {warned} = build();
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.hostToReturn = TARGET_HOST;

        await fakeConfig.fireConcurrentTwice();

        assert.strictEqual(warned.length, 1);
    });
});
