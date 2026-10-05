import assert from "assert";
import {EventEmitter} from "vscode";
import {deepEqual, instance, mock, reset, verify} from "ts-mockito";
import {Telemetry} from "../telemetry";
import {Events} from "../telemetry/constants";
import {HostMismatch} from "./RemoteTargetHostManager";
import {
    ALLOW_LABEL,
    REVOKE_LABEL,
    RemoteHostMismatchPrompter,
    RemoteTargetHostCommands,
    SWITCH_TARGET_LABEL,
} from "./RemoteTargetHostCommands";

const MISMATCH: HostMismatch = {
    envHost: "dogfood.cloud.databricks.com",
    targetHost: "logfood.cloud.databricks.com",
    target: "prod",
    allowed: false,
};

// Lets the async warning handler settle after the event fires.
function flush() {
    return new Promise((resolve) => setImmediate(resolve));
}

describe("RemoteTargetHostCommands", () => {
    let mismatchEmitter: EventEmitter<HostMismatch>;
    let currentMismatch: HostMismatch | undefined;
    let allowCalls: Array<[HostMismatch, boolean]>;
    let mockTelemetry: Telemetry;
    let commandsUnderTest: RemoteTargetHostCommands | undefined;

    function build(choice: string | undefined) {
        const shown: Array<{message: string; items: string[]}> = [];
        const executed: string[] = [];
        const prompter: RemoteHostMismatchPrompter = {
            showWarningMessage: ((message: string, ...items: string[]) => {
                shown.push({message, items});
                return Promise.resolve(choice);
            }) as unknown as RemoteHostMismatchPrompter["showWarningMessage"],
            executeCommand: ((command: string) => {
                executed.push(command);
                return Promise.resolve(undefined);
            }) as RemoteHostMismatchPrompter["executeCommand"],
        };
        commandsUnderTest = new RemoteTargetHostCommands(
            {
                get mismatch() {
                    return currentMismatch;
                },
                onDidDetectNewMismatch: mismatchEmitter.event,
                setSessionCredentialsAllowed: async (m, allowed) => {
                    allowCalls.push([m, allowed]);
                },
            },
            instance(mockTelemetry),
            prompter
        );
        return {shown, executed, prompter};
    }

    function verifyAction(action: string) {
        verify(
            mockTelemetry.recordEvent(
                Events.BUNDLE_REMOTE_HOST_MISMATCH_WARNING,
                deepEqual({action} as any)
            )
        ).once();
    }

    beforeEach(() => {
        mismatchEmitter = new EventEmitter<HostMismatch>();
        currentMismatch = undefined;
        allowCalls = [];
        mockTelemetry = mock(Telemetry);
    });

    afterEach(() => {
        commandsUnderTest?.dispose();
        reset(mockTelemetry);
    });

    it("explains the paused commands and records 'dismissed' on close", async () => {
        const {shown, executed} = build(undefined);

        mismatchEmitter.fire(MISMATCH);
        await flush();

        assert.strictEqual(shown.length, 1);
        assert.match(shown[0].message, /paused/);
        assert.deepStrictEqual(shown[0].items, [
            SWITCH_TARGET_LABEL,
            ALLOW_LABEL,
        ]);
        assert.deepStrictEqual(executed, []);
        assert.deepStrictEqual(allowCalls, []);
        verifyAction("dismissed");
    });

    it("opens the target picker and records 'switch-target'", async () => {
        const {executed} = build(SWITCH_TARGET_LABEL);

        mismatchEmitter.fire(MISMATCH);
        await flush();

        assert.deepStrictEqual(executed, [
            "databricks.connection.bundle.selectTarget",
        ]);
        verifyAction("switch-target");
    });

    it("allows the session credentials and records 'allowed'", async () => {
        build(ALLOW_LABEL);

        mismatchEmitter.fire(MISMATCH);
        await flush();

        assert.deepStrictEqual(allowCalls, [[MISMATCH, true]]);
        verifyAction("allowed");
    });

    it("offers to revoke an allowed mismatch from the Target row", async () => {
        currentMismatch = {...MISMATCH, allowed: true};
        const {shown} = build(REVOKE_LABEL);

        await commandsUnderTest!.reviewHostMismatch();

        assert.deepStrictEqual(shown[0].items, [
            SWITCH_TARGET_LABEL,
            REVOKE_LABEL,
        ]);
        assert.deepStrictEqual(allowCalls, [[currentMismatch, false]]);
        verifyAction("revoked");
    });

    it("does nothing from the Target row without a mismatch", async () => {
        const {shown} = build(undefined);

        await commandsUnderTest!.reviewHostMismatch();

        assert.strictEqual(shown.length, 0);
    });

    it("records the action before the follow-up finishes", async () => {
        const {prompter} = build(SWITCH_TARGET_LABEL);
        // A target picker the user leaves open.
        let recordedWhilePickerOpen = false;
        prompter.executeCommand = (() => {
            try {
                verifyAction("switch-target");
                recordedWhilePickerOpen = true;
            } catch {
                // not recorded yet
            }
            return new Promise(() => {});
        }) as RemoteHostMismatchPrompter["executeCommand"];

        mismatchEmitter.fire(MISMATCH);
        await flush();

        assert.strictEqual(recordedWhilePickerOpen, true);
    });
});
