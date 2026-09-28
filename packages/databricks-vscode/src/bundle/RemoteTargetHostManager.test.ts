import assert from "assert";
import {Disposable} from "vscode";
import {deepEqual, instance, mock, reset, verify, when} from "ts-mockito";
import {StateStorage} from "../vscode-objs/StateStorage";
import {Telemetry} from "../telemetry";
import {Events} from "../telemetry/constants";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {
    RemoteTargetHostManager,
    RemoteHostMismatchPrompter,
    SWITCH_TARGET_LABEL,
    DONT_WARN_FOR_TARGET_LABEL,
} from "./RemoteTargetHostManager";

const HIDE_KEY = "databricks.bundle.remote.hideHostMismatchWarning";
const SELECT_TARGET_COMMAND = "databricks.connection.bundle.selectTarget";

const ENV_HOST = new URL("https://dogfood.cloud.databricks.com");
const TARGET_HOST = new URL("https://logfood.cloud.databricks.com");
const OTHER_HOST = new URL("https://staging.cloud.databricks.com");
const PAIR = `${ENV_HOST.hostname}->${TARGET_HOST.hostname}`;

/**
 * Hand-rolled stand-in for {@link ConfigModel}: the base model exposes
 * `onDidChangeTarget` and `get` as bound instance fields ts-mockito can't stub,
 * so we drive them directly. `fire()` replays a target change.
 */
class FakeConfigModel {
    private listeners: Array<() => unknown> = [];
    public target: string | undefined;
    public hostToReturn: URL | undefined;

    onDidChangeTarget(cb: () => unknown): Disposable {
        this.listeners.push(cb);
        return {dispose() {}};
    }

    async get(): Promise<URL | undefined> {
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
    public databricksWorkspace: {authProvider: {host: URL}} | undefined;

    onDidChangeState(): Disposable {
        return {dispose() {}};
    }

    setEnvHost(host: URL | undefined) {
        this.databricksWorkspace =
            host === undefined ? undefined : {authProvider: {host}};
    }
}

class FakeWorkspaceFolderManager {
    onDidChangeActiveProjectFolder(): Disposable {
        return {dispose() {}};
    }
}

function makePrompter(choice: string | undefined): {
    prompter: RemoteHostMismatchPrompter;
    executed: string[];
    shownCount: () => number;
} {
    const executed: string[] = [];
    let shown = 0;
    const prompter: RemoteHostMismatchPrompter = {
        showWarningMessage: (() => {
            shown++;
            return Promise.resolve(choice);
        }) as RemoteHostMismatchPrompter["showWarningMessage"],
        executeCommand: ((command: string) => {
            executed.push(command);
            return Promise.resolve(undefined);
        }) as RemoteHostMismatchPrompter["executeCommand"],
    };
    return {prompter, executed, shownCount: () => shown};
}

describe("RemoteTargetHostManager", () => {
    let fakeConfig: FakeConfigModel;
    let fakeConnection: FakeConnectionManager;
    let fakeFolders: FakeWorkspaceFolderManager;
    let mockStorage: StateStorage;
    let mockTelemetry: Telemetry;

    function build(
        prompter: RemoteHostMismatchPrompter
    ): RemoteTargetHostManager {
        return new RemoteTargetHostManager(
            fakeConfig as unknown as ConfigModel,
            fakeConnection as unknown as ConnectionManager,
            fakeFolders as unknown as WorkspaceFolderManager,
            instance(mockStorage),
            instance(mockTelemetry),
            prompter
        );
    }

    beforeEach(() => {
        fakeConfig = new FakeConfigModel();
        fakeConnection = new FakeConnectionManager();
        fakeFolders = new FakeWorkspaceFolderManager();
        mockStorage = mock(StateStorage);
        mockTelemetry = mock(Telemetry);
        when(mockStorage.get(HIDE_KEY)).thenReturn([]);
    });

    afterEach(() => {
        reset(mockStorage);
        reset(mockTelemetry);
    });

    it("warns once on a host mismatch and records 'dismissed' on close", async () => {
        const {prompter, shownCount} = makePrompter(undefined);
        const manager = build(prompter);
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.hostToReturn = TARGET_HOST;

        await fakeConfig.fire();

        assert.strictEqual(shownCount(), 1);
        assert.deepStrictEqual(manager.mismatch, {
            envHost: ENV_HOST.hostname,
            targetHost: TARGET_HOST.hostname,
            target: "prod",
        });
        verify(
            mockTelemetry.recordEvent(
                Events.BUNDLE_REMOTE_HOST_MISMATCH_WARNING,
                deepEqual({action: "dismissed"})
            )
        ).once();
    });

    it("does not warn when the hosts match (trailing-slash tolerant)", async () => {
        const {prompter, shownCount} = makePrompter(undefined);
        const manager = build(prompter);
        fakeConnection.setEnvHost(
            new URL("https://dogfood.cloud.databricks.com/")
        );
        fakeConfig.target = "dev";
        fakeConfig.hostToReturn = new URL(
            "https://dogfood.cloud.databricks.com"
        );

        await fakeConfig.fire();

        assert.strictEqual(shownCount(), 0);
        assert.strictEqual(manager.mismatch, undefined);
    });

    it("does not warn when no target is selected", async () => {
        const {prompter, shownCount} = makePrompter(undefined);
        const manager = build(prompter);
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = undefined;
        fakeConfig.hostToReturn = TARGET_HOST;

        await fakeConfig.fire();

        assert.strictEqual(shownCount(), 0);
        assert.strictEqual(manager.mismatch, undefined);
    });

    it("does not warn when not connected (no environment host)", async () => {
        const {prompter, shownCount} = makePrompter(undefined);
        build(prompter);
        fakeConnection.setEnvHost(undefined);
        fakeConfig.target = "prod";
        fakeConfig.hostToReturn = TARGET_HOST;

        await fakeConfig.fire();

        assert.strictEqual(shownCount(), 0);
    });

    it("does not warn when the target host is undefined (invalid-host path owns it)", async () => {
        const {prompter, shownCount} = makePrompter(undefined);
        const manager = build(prompter);
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.hostToReturn = undefined;

        await fakeConfig.fire();

        assert.strictEqual(shownCount(), 0);
        assert.strictEqual(manager.mismatch, undefined);
    });

    it("warns at most once per session for the same pair, but again for a new pair", async () => {
        const {prompter, shownCount} = makePrompter(undefined);
        build(prompter);
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.hostToReturn = TARGET_HOST;

        await fakeConfig.fire();
        await fakeConfig.fire();
        await fakeConfig.fire();
        assert.strictEqual(shownCount(), 1);

        // A target on a different host is a new pair and re-warns.
        fakeConfig.hostToReturn = OTHER_HOST;
        await fakeConfig.fire();
        assert.strictEqual(shownCount(), 2);
    });

    it("re-warns when the mismatch clears and then recurs", async () => {
        const {prompter, shownCount} = makePrompter(undefined);
        build(prompter);
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.hostToReturn = TARGET_HOST;

        await fakeConfig.fire();
        assert.strictEqual(shownCount(), 1);

        // Hosts now match: mismatch clears and the session latch resets.
        fakeConfig.hostToReturn = ENV_HOST;
        await fakeConfig.fire();
        assert.strictEqual(shownCount(), 1);

        // Same mismatch recurs: warns again.
        fakeConfig.hostToReturn = TARGET_HOST;
        await fakeConfig.fire();
        assert.strictEqual(shownCount(), 2);
    });

    it("stays silent for an opted-out pair but still warns for a different pair", async () => {
        when(mockStorage.get(HIDE_KEY)).thenReturn([PAIR]);
        const {prompter, shownCount} = makePrompter(undefined);
        build(prompter);
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.hostToReturn = TARGET_HOST;

        await fakeConfig.fire();
        assert.strictEqual(shownCount(), 0);

        // A different pair is not opted out and still warns.
        fakeConfig.hostToReturn = OTHER_HOST;
        await fakeConfig.fire();
        assert.strictEqual(shownCount(), 1);
    });

    it("opens the target picker and records 'switch-target'", async () => {
        const {prompter, executed} = makePrompter(SWITCH_TARGET_LABEL);
        build(prompter);
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.hostToReturn = TARGET_HOST;

        await fakeConfig.fire();

        assert.deepStrictEqual(executed, [SELECT_TARGET_COMMAND]);
        verify(
            mockTelemetry.recordEvent(
                Events.BUNDLE_REMOTE_HOST_MISMATCH_WARNING,
                deepEqual({action: "switch-target"})
            )
        ).once();
    });

    it("persists the per-pair opt-out and records 'hidden' on 'Don't warn for this target'", async () => {
        const {prompter, executed} = makePrompter(DONT_WARN_FOR_TARGET_LABEL);
        build(prompter);
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.hostToReturn = TARGET_HOST;

        await fakeConfig.fire();

        assert.strictEqual(executed.length, 0);
        verify(mockStorage.set(HIDE_KEY, deepEqual([PAIR]))).once();
        verify(
            mockTelemetry.recordEvent(
                Events.BUNDLE_REMOTE_HOST_MISMATCH_WARNING,
                deepEqual({action: "hidden"})
            )
        ).once();
    });

    it("warns only once when two concurrent evaluations read the same mismatch", async () => {
        const {prompter, shownCount} = makePrompter(undefined);
        build(prompter);
        fakeConnection.setEnvHost(ENV_HOST);
        fakeConfig.target = "prod";
        fakeConfig.hostToReturn = TARGET_HOST;

        await fakeConfig.fireConcurrentTwice();

        assert.strictEqual(shownCount(), 1);
    });
});
