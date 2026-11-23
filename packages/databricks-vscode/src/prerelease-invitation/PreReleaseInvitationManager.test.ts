import assert from "assert";
import FakeTimers from "@sinonjs/fake-timers";
import {
    EventEmitter,
    ExtensionContext,
    Memento,
    commands,
    env,
    window,
} from "vscode";
import type {ConnectionState} from "../configuration/models/WorkspaceConnectionModel";
import type {Telemetry} from "../telemetry";
import {StateStorage} from "../vscode-objs/StateStorage";
import {
    PreReleaseInvitationManager,
    SHOW_DELAY_MS,
    isInvitationHost,
} from "./PreReleaseInvitationManager";

const SWITCH = "Switch to Pre-Release";
const RELOAD = "Reload Window";
const RELEASE_NOTES = "Release Notes";
const DONT_SHOW_AGAIN = "Don't show again";

// Replaces a VS Code API function for one test. ts-mockito can't stub the
// vscode namespace, so swap the functions, as the other tests do.
const restores: Array<() => void> = [];
function stub<T extends object>(target: T, key: keyof T & string, fn: unknown) {
    const original = target[key];
    Object.assign(target, {[key]: fn});
    restores.push(() => Object.assign(target, {[key]: original}));
}

// For a getter-only property such as env.uriScheme.
function stubGetter<T extends object>(
    target: T,
    key: keyof T & string,
    value: unknown
) {
    const original = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, {value, configurable: true});
    restores.push(() => {
        if (original) {
            Object.defineProperty(target, key, original);
        }
    });
}

function createStorage() {
    const store = new Map<string, unknown>();
    const memento = {
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
    return new StateStorage({
        globalState: memento,
        workspaceState: memento,
    } as unknown as ExtensionContext);
}

function createConnection(state: ConnectionState) {
    const emitter = new EventEmitter<ConnectionState>();
    const connection = {
        state,
        onDidChangeState: emitter.event,
        change(next: ConnectionState) {
            connection.state = next;
            emitter.fire(next);
        },
    };
    return connection;
}

const managers: PreReleaseInvitationManager[] = [];

/**
 * A manager whose prompts answer from `answers` in order. The VS Code test
 * host runs 1.138 locally, so the host check passes without stubbing. Pass
 * an earlier manager's `storage` to stand for a new window.
 */
function setUp(
    options: {
        answers?: Array<string | undefined>;
        connected?: boolean;
        switchError?: Error;
        storage?: StateStorage;
    } = {}
) {
    const storage = options.storage ?? createStorage();
    const answers = [...(options.answers ?? [])];
    const prompts: string[] = [];
    const errors: string[] = [];
    const commandCalls: unknown[][] = [];
    const recorded: unknown[] = [];

    // Like the real notification, only a button it offers can be the answer.
    stub(
        window,
        "showInformationMessage",
        async (message: string, ...buttons: string[]) => {
            prompts.push(message);
            const answer = answers.shift();
            return answer !== undefined && buttons.includes(answer)
                ? answer
                : undefined;
        }
    );
    stub(window, "showErrorMessage", async (message: string) => {
        errors.push(message);
    });
    stub(env, "openExternal", async () => true);
    stub(commands, "executeCommand", async (...args: unknown[]) => {
        commandCalls.push(args);
        if (
            args[0] === "workbench.extensions.installExtension" &&
            options.switchError
        ) {
            throw options.switchError;
        }
    });

    const connection = createConnection(
        options.connected === false ? "DISCONNECTED" : "CONNECTED"
    );
    const telemetry: Pick<Telemetry, "recordEvent"> = {
        recordEvent: (_name, props) => {
            recorded.push(props);
        },
    };
    const manager = new PreReleaseInvitationManager(
        connection,
        storage,
        telemetry
    );
    managers.push(manager);
    return {
        manager,
        connection,
        storage,
        prompts,
        errors,
        commandCalls,
        recorded,
    };
}

describe("PreReleaseInvitation host rules", () => {
    const local = {
        uriScheme: "vscode",
        remoteName: undefined,
        vscodeVersion: "1.128.0",
    };

    it("allows local VS Code 1.128.0 and later, Insiders included", () => {
        assert.ok(isInvitationHost(local));
        assert.ok(isInvitationHost({...local, vscodeVersion: "1.146.0"}));
        assert.ok(
            isInvitationHost({
                uriScheme: "vscode-insiders",
                remoteName: undefined,
                vscodeVersion: "1.128.0-insider",
            })
        );
    });

    it("rejects forks, remote windows, older VS Code and unreadable versions", () => {
        assert.ok(!isInvitationHost({...local, uriScheme: "cursor"}));
        assert.ok(!isInvitationHost({...local, remoteName: "ssh-remote"}));
        assert.ok(!isInvitationHost({...local, vscodeVersion: "1.127.9"}));
        assert.ok(!isInvitationHost({...local, vscodeVersion: "unknown"}));
    });
});

describe("PreReleaseInvitationManager", () => {
    let clock: FakeTimers.Clock;
    beforeEach(() => {
        // Timeouts and Date only: the other timers stay real for the storage writes.
        clock = FakeTimers.install({
            toFake: ["setTimeout", "clearTimeout", "Date"],
            shouldClearNativeTimers: true,
            now: Date.UTC(2026, 10, 18),
        });
    });
    afterEach(() => {
        // Dispose while the fake clock is still installed, so no real timer is left armed.
        managers.splice(0).forEach((m) => m.dispose());
        // Undo the stubs in reverse, so a key stubbed twice ends on its original value.
        restores
            .splice(0)
            .reverse()
            .forEach((restore) => restore());
        clock.uninstall();
    });

    // Advances the fake clock, then lets the awaited storage writes settle.
    async function elapse(ms: number) {
        await clock.tickAsync(ms);
        await new Promise((r) => setImmediate(r));
    }

    it("shows the invitation only after the connection has been up for the delay", async () => {
        const {connection, prompts, recorded} = setUp({
            connected: false,
            answers: [undefined],
        });
        connection.change("CONNECTED");
        await elapse(SHOW_DELAY_MS - 1);
        assert.strictEqual(prompts.length, 0, "shown before the delay");
        await elapse(1);
        assert.strictEqual(prompts.length, 1);
        assert.deepStrictEqual(recorded, [
            {answer: "shown"},
            {answer: "dismissed"},
        ]);
    });

    it("is cancelled if the connection drops within the delay", async () => {
        const {connection, prompts} = setUp();
        await elapse(SHOW_DELAY_MS / 2);
        connection.change("DISCONNECTED");
        await elapse(SHOW_DELAY_MS);
        assert.strictEqual(prompts.length, 0);
    });

    it("dispose cancels a pending showing", async () => {
        const {manager, prompts} = setUp();
        manager.dispose();
        await elapse(SHOW_DELAY_MS);
        assert.strictEqual(prompts.length, 0);
    });

    it("is not shown in a fork", async () => {
        stubGetter(env, "uriScheme", "cursor");
        const {manager, prompts} = setUp();
        await manager.showIfDue();
        assert.strictEqual(prompts.length, 0);
    });

    it("is not shown in a remote window", async () => {
        stubGetter(env, "remoteName", "ssh-remote");
        const {manager, prompts} = setUp();
        await manager.showIfDue();
        assert.strictEqual(prompts.length, 0);
    });

    it("is shown once in a window, even after a reconnect", async () => {
        const {manager, connection, prompts} = setUp({
            answers: [undefined, undefined],
        });
        await elapse(SHOW_DELAY_MS);
        assert.strictEqual(prompts.length, 1);
        connection.change("DISCONNECTED");
        connection.change("CONNECTED");
        await elapse(SHOW_DELAY_MS);
        await manager.showIfDue();
        assert.strictEqual(prompts.length, 1);
    });

    it("is shown again in a new window after it was closed", async () => {
        const first = setUp({answers: [undefined]});
        await first.manager.showIfDue();
        const second = setUp({answers: [undefined], storage: first.storage});
        await second.manager.showIfDue();
        assert.strictEqual(second.prompts.length, 1);
    });

    it("is not shown in a new window after Don't show again", async () => {
        const first = setUp({answers: [DONT_SHOW_AGAIN]});
        await first.manager.showIfDue();
        assert.deepStrictEqual(first.recorded, [
            {answer: "shown"},
            {answer: "dontShowAgain"},
        ]);
        assert.deepStrictEqual(first.commandCalls, []);
        const second = setUp({answers: [undefined], storage: first.storage});
        await second.manager.showIfDue();
        assert.strictEqual(second.prompts.length, 0);
    });

    it("is not offered from 2026-12-03 (UTC)", async () => {
        const before = setUp({answers: [undefined]});
        clock.setSystemTime(Date.UTC(2026, 11, 2, 23, 59));
        await before.manager.showIfDue();
        assert.strictEqual(before.prompts.length, 1);

        const after = setUp({answers: [undefined]});
        clock.setSystemTime(Date.UTC(2026, 11, 3));
        await after.manager.showIfDue();
        assert.strictEqual(after.prompts.length, 0);
    });

    it("switches to the pre-release and reloads on Reload Window", async () => {
        const {manager, commandCalls, recorded} = setUp({
            answers: [SWITCH, RELOAD],
        });
        await manager.showIfDue();
        assert.deepStrictEqual(commandCalls, [
            [
                "workbench.extensions.installExtension",
                "databricks.databricks",
                {installPreReleaseVersion: true},
            ],
            ["workbench.action.reloadWindow"],
        ]);
        assert.deepStrictEqual(recorded, [
            {answer: "shown"},
            {answer: "switch"},
        ]);
    });

    it("is not shown in a new window after a switch", async () => {
        const first = setUp({answers: [SWITCH, undefined]});
        await first.manager.showIfDue();
        const second = setUp({answers: [undefined], storage: first.storage});
        await second.manager.showIfDue();
        assert.strictEqual(second.prompts.length, 0);
    });

    it("does not reload when the reload prompt is closed", async () => {
        const {manager, prompts, commandCalls} = setUp({
            answers: [SWITCH, undefined],
        });
        await manager.showIfDue();
        assert.strictEqual(prompts.length, 2, "invitation and reload prompt");
        assert.strictEqual(commandCalls.length, 1);
    });

    it("shows a generic error and records a failed switch", async () => {
        const {manager, errors, prompts, recorded} = setUp({
            answers: [SWITCH],
            switchError: new Error("gallery unreachable"),
        });
        await manager.showIfDue();
        assert.strictEqual(errors.length, 1);
        assert.ok(!errors[0].includes("gallery unreachable"));
        assert.strictEqual(prompts.length, 1, "no reload prompt");
        assert.deepStrictEqual(recorded.at(-1), {answer: "switchFailed"});
    });

    it("is shown again in a new window after a failed switch", async () => {
        const first = setUp({
            answers: [SWITCH],
            switchError: new Error("gallery unreachable"),
        });
        await first.manager.showIfDue();
        const second = setUp({answers: [undefined], storage: first.storage});
        await second.manager.showIfDue();
        assert.strictEqual(second.prompts.length, 1);
    });

    it("opens the release notes, and is shown again in a new window", async () => {
        const first = setUp({answers: [RELEASE_NOTES]});
        await first.manager.showIfDue();
        assert.deepStrictEqual(first.recorded.at(-1), {answer: "releaseNotes"});
        const second = setUp({answers: [undefined], storage: first.storage});
        await second.manager.showIfDue();
        assert.strictEqual(second.prompts.length, 1);
    });
});
