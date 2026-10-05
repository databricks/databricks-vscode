import assert from "assert";
import {EventEmitter} from "vscode";
import {deepEqual, instance, mock, reset, verify} from "ts-mockito";
import {Telemetry} from "../telemetry";
import {Events} from "../telemetry/constants";
import {HostMismatch} from "./RemoteTargetHostManager";
import {
    DONT_WARN_FOR_TARGET_LABEL,
    RemoteHostMismatchPrompter,
    RemoteTargetHostCommands,
    SWITCH_TARGET_LABEL,
} from "./RemoteTargetHostCommands";

const MISMATCH: HostMismatch = {
    envHost: "dogfood.cloud.databricks.com",
    targetHost: "logfood.cloud.databricks.com",
    target: "prod",
};

// Lets the async warning handler settle after the event fires.
function flush() {
    return new Promise((resolve) => setImmediate(resolve));
}

describe("RemoteTargetHostCommands", () => {
    let mismatchEmitter: EventEmitter<HostMismatch>;
    let hidden: HostMismatch[];
    let mockTelemetry: Telemetry;
    let commandsUnderTest: RemoteTargetHostCommands | undefined;

    function build(choice: string | undefined) {
        const shown: string[] = [];
        const executed: string[] = [];
        const prompter: RemoteHostMismatchPrompter = {
            showWarningMessage: ((message: string) => {
                shown.push(message);
                return Promise.resolve(choice);
            }) as RemoteHostMismatchPrompter["showWarningMessage"],
            executeCommand: ((command: string) => {
                executed.push(command);
                return Promise.resolve(undefined);
            }) as RemoteHostMismatchPrompter["executeCommand"],
        };
        commandsUnderTest = new RemoteTargetHostCommands(
            {
                onDidDetectNewMismatch: mismatchEmitter.event,
                hideWarning: async (m) => {
                    hidden.push(m);
                },
            },
            instance(mockTelemetry),
            prompter
        );
        return {shown, executed};
    }

    beforeEach(() => {
        mismatchEmitter = new EventEmitter<HostMismatch>();
        hidden = [];
        mockTelemetry = mock(Telemetry);
    });

    afterEach(() => {
        commandsUnderTest?.dispose();
        reset(mockTelemetry);
    });

    it("explains the mismatch and records 'dismissed' on close", async () => {
        const {shown, executed} = build(undefined);

        mismatchEmitter.fire(MISMATCH);
        await flush();

        assert.strictEqual(shown.length, 1);
        assert.match(
            shown[0],
            /sends? dogfood\.cloud\.databricks\.com's credentials to logfood/
        );
        assert.deepStrictEqual(executed, []);
        assert.deepStrictEqual(hidden, []);
        verify(
            mockTelemetry.recordEvent(
                Events.BUNDLE_REMOTE_HOST_MISMATCH_WARNING,
                deepEqual({action: "dismissed"})
            )
        ).once();
    });

    it("opens the target picker and records 'switch-target'", async () => {
        const {executed} = build(SWITCH_TARGET_LABEL);

        mismatchEmitter.fire(MISMATCH);
        await flush();

        assert.deepStrictEqual(executed, [
            "databricks.connection.bundle.selectTarget",
        ]);
        verify(
            mockTelemetry.recordEvent(
                Events.BUNDLE_REMOTE_HOST_MISMATCH_WARNING,
                deepEqual({action: "switch-target"})
            )
        ).once();
    });

    it("hides the pair and records 'hidden' on 'Don't warn for this target'", async () => {
        const {executed} = build(DONT_WARN_FOR_TARGET_LABEL);

        mismatchEmitter.fire(MISMATCH);
        await flush();

        assert.deepStrictEqual(executed, []);
        assert.deepStrictEqual(hidden, [MISMATCH]);
        verify(
            mockTelemetry.recordEvent(
                Events.BUNDLE_REMOTE_HOST_MISMATCH_WARNING,
                deepEqual({action: "hidden"})
            )
        ).once();
    });
});
