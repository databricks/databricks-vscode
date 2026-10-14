import assert from "assert";
import {Disposable, EventEmitter} from "vscode";
import {
    ConfigModel,
    TargetWorkspaceHost,
} from "../configuration/models/ConfigModel";
import {RemoteTargetHostManager} from "./RemoteTargetHostManager";

const ENV_HOST = new URL("https://dogfood.cloud.databricks.com");
const TARGET_HOST = new URL("https://logfood.cloud.databricks.com");

/**
 * Hand-rolled stand-in for {@link ConfigModel}: the base model exposes its
 * change events and `getTargetWorkspaceHost` as bound instance fields ts-mockito
 * can't stub, so we drive them directly. `pinnedHost` stands in for the pinned
 * (session) provider's host — the manager compares against it, not a live
 * connection. `fire*()` replay the various change events.
 */
class FakeConfigModel {
    private targetListeners: Array<() => unknown> = [];
    private hostListeners: Array<() => unknown> = [];
    private authListeners: Array<() => unknown> = [];
    public target: string | undefined;
    public pinnedHost: URL | undefined;
    public resolution: TargetWorkspaceHost = {kind: "session"};
    public getError: Error | undefined;

    /** Point the target at an explicit host, or (undefined) give it none. */
    setTargetHost(host: URL | undefined) {
        this.resolution =
            host === undefined ? {kind: "session"} : {kind: "host", host};
    }

    onDidChangeTarget(cb: () => unknown): Disposable {
        this.targetListeners.push(cb);
        return {dispose() {}};
    }

    onDidChangeKey() {
        return (cb: () => unknown): Disposable => {
            this.hostListeners.push(cb);
            return {dispose() {}};
        };
    }

    onDidChangeAuthProvider(cb: () => unknown): Disposable {
        this.authListeners.push(cb);
        return {dispose() {}};
    }

    async getTargetWorkspaceHost(): Promise<TargetWorkspaceHost> {
        if (this.getError) {
            throw this.getError;
        }
        return this.resolution;
    }

    async fire(): Promise<void> {
        for (const cb of this.targetListeners) {
            await cb();
        }
    }

    async fireHostChange(): Promise<void> {
        for (const cb of this.hostListeners) {
            await cb();
        }
    }

    async fireAuthChange(): Promise<void> {
        for (const cb of this.authListeners) {
            await cb();
        }
    }

    // Invoke the target listener twice without awaiting between, so the second
    // runs while the first is still awaiting the host — the concurrency the
    // manager must tolerate.
    async fireConcurrentTwice(): Promise<void> {
        await Promise.all(this.targetListeners.flatMap((cb) => [cb(), cb()]));
    }
}

describe("RemoteTargetHostManager", () => {
    let fakeConfig: FakeConfigModel;
    let bundleFiles: EventEmitter<void>;

    function build(): {
        manager: RemoteTargetHostManager;
        changes: () => number;
    } {
        const manager = new RemoteTargetHostManager(
            fakeConfig as unknown as ConfigModel,
            bundleFiles.event
        );
        let count = 0;
        manager.onDidChangePaused(() => count++);
        return {manager, changes: () => count};
    }

    beforeEach(() => {
        fakeConfig = new FakeConfigModel();
        bundleFiles = new EventEmitter<void>();
    });

    afterEach(() => {
        bundleFiles.dispose();
    });

    it("detects a host mismatch and exposes it", async () => {
        const {manager, changes} = build();
        fakeConfig.pinnedHost = ENV_HOST;
        fakeConfig.target = "prod";
        fakeConfig.setTargetHost(TARGET_HOST);

        await fakeConfig.fire();

        assert.deepStrictEqual(manager.paused, {
            target: "prod",
            reason: "host-mismatch",
            envHost: ENV_HOST.hostname,
            targetHost: TARGET_HOST.hostname,
        });
        assert.strictEqual(changes(), 1);
    });

    it("does not flag when the hosts match (trailing-slash tolerant)", async () => {
        const {manager} = build();
        fakeConfig.pinnedHost = new URL(
            "https://dogfood.cloud.databricks.com/"
        );
        fakeConfig.target = "dev";
        fakeConfig.setTargetHost(
            new URL("https://dogfood.cloud.databricks.com")
        );

        await fakeConfig.fire();

        assert.strictEqual(manager.paused, undefined);
    });

    it("does not flag when no target is selected", async () => {
        const {manager} = build();
        fakeConfig.pinnedHost = ENV_HOST;
        fakeConfig.target = undefined;
        fakeConfig.setTargetHost(TARGET_HOST);

        await fakeConfig.fire();

        assert.strictEqual(manager.paused, undefined);
    });

    it("does not flag when no provider is pinned yet", async () => {
        const {manager} = build();
        fakeConfig.pinnedHost = undefined;
        fakeConfig.target = "prod";
        fakeConfig.setTargetHost(TARGET_HOST);

        await fakeConfig.fire();

        assert.strictEqual(manager.paused, undefined);
    });

    it("does not flag a target with no host (the CLI uses the session host)", async () => {
        const {manager} = build();
        fakeConfig.pinnedHost = ENV_HOST;
        fakeConfig.target = "prod";
        fakeConfig.resolution = {kind: "session"};

        await fakeConfig.fire();

        assert.strictEqual(manager.paused, undefined);
    });

    it("pauses an unresolved target and names its reason", async () => {
        const {manager} = build();
        fakeConfig.pinnedHost = ENV_HOST;
        fakeConfig.target = "prod";
        fakeConfig.resolution = {kind: "unresolved", reason: "multi-file"};

        await fakeConfig.fire();

        assert.deepStrictEqual(manager.paused, {
            target: "prod",
            reason: "multi-file",
            envHost: ENV_HOST.hostname,
        });
    });

    it("re-evaluates when the target's workspace.host changes", async () => {
        const {manager, changes} = build();
        fakeConfig.pinnedHost = ENV_HOST;
        fakeConfig.target = "prod";
        fakeConfig.setTargetHost(TARGET_HOST);

        await fakeConfig.fire();
        assert.notStrictEqual(manager.paused, undefined);

        // The user fixes workspace.host in databricks.yml; the target name
        // doesn't change, so only the host-key event fires.
        fakeConfig.setTargetHost(ENV_HOST);
        await fakeConfig.fireHostChange();
        assert.strictEqual(manager.paused, undefined);

        // Breaking it again flags again.
        fakeConfig.setTargetHost(TARGET_HOST);
        await fakeConfig.fireHostChange();
        assert.notStrictEqual(manager.paused, undefined);
        // set → clear → set is three distinct changes.
        assert.strictEqual(changes(), 3);
    });

    it("re-evaluates on a bundle-file change that moves the decision", async () => {
        const {manager} = build();
        fakeConfig.pinnedHost = ENV_HOST;
        fakeConfig.target = "prod";
        // A second include file adds a profile: unresolved, but no `host` key
        // changed, so only the bundle-files event fires.
        fakeConfig.resolution = {kind: "unresolved", reason: "profile"};

        bundleFiles.fire();
        await flush();
        assert.deepStrictEqual(manager.paused, {
            target: "prod",
            reason: "profile",
            envHost: ENV_HOST.hostname,
        });

        // The user removes the profile; the badge clears on the next file change.
        fakeConfig.resolution = {kind: "session"};
        bundleFiles.fire();
        await flush();
        assert.strictEqual(manager.paused, undefined);
    });

    it("re-evaluates when the provider is pinned", async () => {
        const {manager} = build();
        fakeConfig.target = "prod";
        fakeConfig.setTargetHost(TARGET_HOST);

        // Not pinned yet: nothing shows even though the target points elsewhere.
        await fakeConfig.fire();
        assert.strictEqual(manager.paused, undefined);

        // The environment connect pins the provider.
        fakeConfig.pinnedHost = ENV_HOST;
        await fakeConfig.fireAuthChange();
        assert.notStrictEqual(manager.paused, undefined);
    });

    it("fires onDidChangePaused only when the paused state changes", async () => {
        const {changes} = build();
        fakeConfig.pinnedHost = ENV_HOST;
        fakeConfig.target = "prod";
        fakeConfig.setTargetHost(TARGET_HOST);

        await fakeConfig.fire();
        await fakeConfig.fireHostChange();
        await fakeConfig.fire();

        assert.strictEqual(changes(), 1);
    });

    it("clears the paused state when the target clears, and restores it when it returns", async () => {
        const {manager} = build();
        fakeConfig.pinnedHost = ENV_HOST;
        fakeConfig.target = "prod";
        fakeConfig.setTargetHost(TARGET_HOST);

        await fakeConfig.fire();
        assert.notStrictEqual(manager.paused, undefined);

        // A folder switch clears the target before resolving the new folder's.
        fakeConfig.target = undefined;
        await fakeConfig.fire();
        assert.strictEqual(manager.paused, undefined);

        // The new folder's target has the same mismatch: it shows again.
        fakeConfig.target = "prod";
        await fakeConfig.fire();
        assert.notStrictEqual(manager.paused, undefined);
    });

    it("keeps the paused state while the provider stays pinned", async () => {
        const {manager} = build();
        fakeConfig.pinnedHost = ENV_HOST;
        fakeConfig.target = "prod";
        fakeConfig.setTargetHost(TARGET_HOST);
        await fakeConfig.fire();
        assert.notStrictEqual(manager.paused, undefined);

        // The connection drops, but ConfigModel keeps the pinned provider, so the
        // guard still refuses — the badge must stay (a re-eval doesn't clear it).
        bundleFiles.fire();
        await flush();

        assert.notStrictEqual(manager.paused, undefined);
    });

    it("clears the paused state when evaluating it throws", async () => {
        const {manager} = build();
        fakeConfig.pinnedHost = ENV_HOST;
        fakeConfig.target = "prod";
        fakeConfig.setTargetHost(TARGET_HOST);
        await fakeConfig.fire();
        assert.notStrictEqual(manager.paused, undefined);

        fakeConfig.getError = new Error("no config");
        await fakeConfig.fire();

        assert.strictEqual(manager.paused, undefined);
    });

    it("changes the paused state only once when two evaluations overlap", async () => {
        const {manager, changes} = build();
        fakeConfig.pinnedHost = ENV_HOST;
        fakeConfig.target = "prod";
        fakeConfig.setTargetHost(TARGET_HOST);

        await fakeConfig.fireConcurrentTwice();

        assert.notStrictEqual(manager.paused, undefined);
        assert.strictEqual(changes(), 1);
    });
});

function flush() {
    return new Promise((resolve) => setImmediate(resolve));
}
