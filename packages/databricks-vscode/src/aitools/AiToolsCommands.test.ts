/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {
    CancellationToken,
    MessageOptions,
    Progress,
    ProgressOptions,
    QuickPick,
    QuickPickItem,
} from "vscode";
import {anything, capture, instance, mock, verify, when} from "ts-mockito";
import {ProcessError} from "../cli/CliWrapper";
import {AiToolsManager, CURSOR_AGENT_ID} from "./AiToolsManager";
import {AiToolsAgentStatus} from "./AiToolsModel";
import {AiToolsCommands, AiToolsPrompter} from "./AiToolsCommands";
import {HostUtils} from "../utils";

/**
 * A minimal, scriptable stand-in for a VS Code QuickPick. `onAccept` decides
 * which items are selected (from the items assigned to the pick) and whether the
 * pick is accepted or dismissed, then drives the accept/hide callbacks the way
 * the real widget would.
 */
class FakeQuickPick {
    title?: string;
    placeholder?: string;
    canSelectMany = false;
    items: readonly QuickPickItem[] = [];
    selectedItems: readonly QuickPickItem[] = [];
    private acceptCbs: Array<() => void> = [];
    private hideCbs: Array<() => void> = [];
    public disposed = false;

    constructor(
        private readonly onAccept: (
            pick: FakeQuickPick
        ) => {selected: readonly QuickPickItem[]} | "dismiss"
    ) {}

    onDidAccept(cb: () => void) {
        this.acceptCbs.push(cb);
        return {dispose() {}};
    }
    onDidHide(cb: () => void) {
        this.hideCbs.push(cb);
        return {dispose() {}};
    }
    show() {
        const result = this.onAccept(this);
        if (result === "dismiss") {
            // Dismissed without accepting: only hide fires.
            this.hideCbs.forEach((cb) => cb());
            return;
        }
        this.selectedItems = result.selected;
        this.acceptCbs.forEach((cb) => cb());
    }
    hide() {
        this.hideCbs.forEach((cb) => cb());
    }
    dispose() {
        this.disposed = true;
    }
}

function agent(
    id: string,
    displayName: string,
    detected: boolean
): AiToolsAgentStatus {
    return {
        id,
        displayName,
        type: detected ? "plugin" : "skills-only",
        detected,
        version: detected ? "0.2.10" : undefined,
    };
}

// A cancellation token whose `isCancellationRequested` is false; enough to
// stand in for the token withProgress would hand the task.
const fakeToken = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({dispose() {}}),
} as unknown as CancellationToken;

/**
 * A scriptable {@link AiToolsPrompter} replacing the VS Code `window` seam.
 * `quickPickBehaviors` drives each createQuickPick call in order (the FakeQuickPick
 * accept/dismiss script); `messageResponses` supplies the string each
 * info/warning message resolves to. Records every created pick and the messages
 * shown so assertions can inspect them.
 */
class FakePrompter implements AiToolsPrompter {
    readonly quickPicks: FakeQuickPick[] = [];
    readonly quickPickBehaviors: Array<
        (
            pick: FakeQuickPick
        ) => {selected: readonly QuickPickItem[]} | "dismiss"
    > = [];
    // Response for the next info/warning message; shift()ed per call.
    readonly messageResponses: Array<string | undefined> = [];
    readonly shownMessages: Array<{message: string; items: string[]}> = [];

    // Run the progress task synchronously with a non-cancelled token, skipping
    // the real notification UI.
    withProgress<R>(
        _options: ProgressOptions,
        task: (
            progress: Progress<{message?: string; increment?: number}>,
            token: CancellationToken
        ) => Thenable<R>
    ): Thenable<R> {
        return Promise.resolve(task({report() {}}, fakeToken));
    }

    showInformationMessage(
        message: string,
        _options: MessageOptions,
        ...items: string[]
    ): Thenable<string | undefined> {
        this.shownMessages.push({message, items});
        return Promise.resolve(this.messageResponses.shift());
    }

    showWarningMessage(
        message: string,
        _options: MessageOptions,
        ...items: string[]
    ): Thenable<string | undefined> {
        this.shownMessages.push({message, items});
        return Promise.resolve(this.messageResponses.shift());
    }

    showErrorMessage(
        message: string,
        ...items: string[]
    ): Thenable<string | undefined>;
    showErrorMessage(
        message: string,
        options: MessageOptions,
        ...items: string[]
    ): Thenable<string | undefined>;
    showErrorMessage(
        message: string,
        optionsOrItem?: MessageOptions | string,
        ...rest: string[]
    ): Thenable<string | undefined> {
        const items =
            typeof optionsOrItem === "string" ? [optionsOrItem, ...rest] : rest;
        this.shownMessages.push({message, items});
        return Promise.resolve(this.messageResponses.shift());
    }

    createQuickPick<T extends QuickPickItem>(): QuickPick<T> {
        const behavior =
            this.quickPickBehaviors.shift() ?? (() => "dismiss" as const);
        const pick = new FakeQuickPick(behavior);
        this.quickPicks.push(pick);
        return pick as unknown as QuickPick<T>;
    }
}

/** Select the scope item matching `scope` in the scope picker. */
function selectScope(scope: "project" | "global") {
    return (pick: FakeQuickPick) => ({
        selected: [
            pick.items.find((i) => (i as any).scope === scope) as QuickPickItem,
        ],
    });
}

function stubIsCursor(value: boolean) {
    (HostUtils as any).isCursor = () => value;
}

// Build an AiToolsCommands wired to a mock manager and a scriptable prompter.
// The manager defaults to a folder being open and no agents reported; tests
// override via when(...) on the returned mockManager. quickPicks/behaviors are
// the prompter's arrays, surfaced for convenience.
function setup() {
    const mockManager = mock(AiToolsManager);
    when(mockManager.hasProjectFolder).thenReturn(true);
    when(mockManager.listAgents(anything())).thenResolve([]);

    const prompter = new FakePrompter();

    return {
        mockManager,
        prompter,
        quickPicks: prompter.quickPicks,
        behaviors: prompter.quickPickBehaviors,
        commands: new AiToolsCommands(instance(mockManager), prompter),
    };
}

describe(__filename, () => {
    let originalIsCursor: typeof HostUtils.isCursor;

    beforeEach(() => {
        // Default to plain VS Code; Cursor-specific tests opt in via
        // stubIsCursor(true).
        originalIsCursor = HostUtils.isCursor;
        stubIsCursor(false);
    });

    afterEach(() => {
        (HostUtils as any).isCursor = originalIsCursor;
    });

    it("shows the agent picker after the scope picker and passes the selection to install", async () => {
        const {commands, mockManager, behaviors, quickPicks} = setup();
        when(mockManager.listAgents("global")).thenResolve([
            agent("claude-code", "Claude Code", true),
            agent("cursor", "Cursor", false),
            agent("codex", "Codex CLI", true),
        ]);
        // Scope picker: choose global. Agent picker: accept as preselected.
        behaviors.push(selectScope("global"));
        behaviors.push((pick) => ({
            selected: pick.selectedItems,
        }));

        await commands.installCommand()("sidePane");

        // The agent picker is the second QuickPick created (after scope).
        assert.strictEqual(quickPicks.length, 2);
        const agentPick = quickPicks[1];
        assert.strictEqual(agentPick.canSelectMany, true);
        assert.deepStrictEqual(
            agentPick.items.map((i) => i.label),
            ["Claude Code", "Cursor", "Codex CLI"]
        );

        const [scope, source, agents] = capture(mockManager.install).last();
        assert.strictEqual(scope, "global");
        assert.strictEqual(source, "sidePane");
        // Detected agents are preselected and installed by default.
        assert.deepStrictEqual(agents, ["claude-code", "codex"]);
    });

    it("preselects only the detected agents", async () => {
        const {commands, mockManager, behaviors, quickPicks} = setup();
        when(mockManager.listAgents("global")).thenResolve([
            agent("claude-code", "Claude Code", true),
            agent("cursor", "Cursor", false),
            agent("codex", "Codex CLI", true),
        ]);
        behaviors.push(selectScope("global"));
        behaviors.push((pick) => ({selected: pick.selectedItems}));

        await commands.installCommand()("sidePane");

        const agentPick = quickPicks[1];
        assert.deepStrictEqual(
            agentPick.selectedItems.map((i) => i.label),
            ["Claude Code", "Codex CLI"]
        );
        // Detected agents carry a "Detected" hint.
        const detectedHints = agentPick.items.map((i) => i.description);
        assert.deepStrictEqual(detectedHints, [
            "Detected",
            undefined,
            "Detected",
        ]);
    });

    it("starts the Cursor plugin checked and labels it in Cursor", async () => {
        stubIsCursor(true);
        const {commands, mockManager, behaviors, quickPicks} = setup();
        when(mockManager.listAgents("global")).thenResolve([
            agent("claude-code", "Claude Code", false),
            agent(CURSOR_AGENT_ID, "Cursor", false),
        ]);
        behaviors.push(selectScope("global"));
        behaviors.push((pick) => ({selected: pick.selectedItems}));

        await commands.installCommand()("sidePane");

        const agentPick = quickPicks[1];
        // Cursor starts checked even though it isn't "detected"; Claude does not.
        assert.deepStrictEqual(
            agentPick.selectedItems.map((i) => i.label),
            ["Cursor"]
        );
        // Cursor is labelled as the plugin rather than a detected skills install.
        const hints = agentPick.items.map((i) => i.description);
        assert.deepStrictEqual(hints, [undefined, "Databricks plugin"]);

        const [, , agents] = capture(mockManager.install).last();
        assert.deepStrictEqual(agents, [CURSOR_AGENT_ID]);
    });

    it("does not force the Cursor entry checked outside Cursor", async () => {
        stubIsCursor(false);
        const {commands, mockManager, behaviors, quickPicks} = setup();
        when(mockManager.listAgents("global")).thenResolve([
            agent(CURSOR_AGENT_ID, "Cursor", false),
        ]);
        behaviors.push(selectScope("global"));
        behaviors.push((pick) => ({selected: pick.selectedItems}));

        await commands.installCommand()("sidePane");

        const agentPick = quickPicks[1];
        assert.deepStrictEqual(agentPick.selectedItems, []);
    });

    it("installs the user's edited selection, not just the detected agents", async () => {
        const {commands, mockManager, behaviors} = setup();
        when(mockManager.listAgents("global")).thenResolve([
            agent("claude-code", "Claude Code", true),
            agent("cursor", "Cursor", false),
        ]);
        behaviors.push(selectScope("global"));
        // User deselects the detected agent and picks the undetected one.
        behaviors.push((pick) => ({
            selected: pick.items.filter((i) => (i as any).agentId === "cursor"),
        }));

        await commands.installCommand()("sidePane");

        const [, , agents] = capture(mockManager.install).last();
        assert.deepStrictEqual(agents, ["cursor"]);
    });

    it("skips the agent picker and installs with an empty selection when no agents are reported", async () => {
        const {commands, mockManager, behaviors, quickPicks} = setup();
        when(mockManager.listAgents("global")).thenResolve([]);
        behaviors.push(selectScope("global"));

        await commands.installCommand()("sidePane");

        // Only the scope picker is created; the agent picker is skipped.
        assert.strictEqual(quickPicks.length, 1);
        const [scope, , agents] = capture(mockManager.install).last();
        assert.strictEqual(scope, "global");
        assert.deepStrictEqual(agents, []);
    });

    it("cancels the install when the agent picker is dismissed", async () => {
        const {commands, mockManager, behaviors} = setup();
        when(mockManager.listAgents("global")).thenResolve([
            agent("claude-code", "Claude Code", true),
        ]);
        behaviors.push(selectScope("global"));
        behaviors.push(() => "dismiss");

        await commands.installCommand()("sidePane");

        verify(mockManager.install(anything(), anything(), anything())).never();
    });

    it("does not show the agent picker when the scope picker is dismissed", async () => {
        const {commands, mockManager, behaviors, quickPicks} = setup();
        behaviors.push(() => "dismiss");

        await commands.installCommand()("sidePane");

        assert.strictEqual(quickPicks.length, 1);
        verify(mockManager.listAgents(anything())).never();
        verify(mockManager.install(anything(), anything(), anything())).never();
    });

    it("lists agents for the chosen scope", async () => {
        const {commands, mockManager, behaviors} = setup();
        when(mockManager.listAgents("project")).thenResolve([
            agent("claude-code", "Claude Code", true),
        ]);
        behaviors.push(selectScope("project"));
        behaviors.push((pick) => ({selected: pick.selectedItems}));

        await commands.installCommand()("sidePane");

        verify(mockManager.listAgents("project")).once();
    });

    describe("installAgentCommand", () => {
        it("installs the agent recovered from the tree node id", async () => {
            const {commands, mockManager} = setup();
            when(
                mockManager.installAgent(anything(), anything())
            ).thenResolve();

            await commands.installAgentCommand()({
                id: "AITOOLS.agent.codex",
            });

            const [agentId] = capture(mockManager.installAgent).last();
            assert.strictEqual(agentId, "codex");
        });

        it("ignores a node without an agent id", async () => {
            const {commands, mockManager} = setup();
            await commands.installAgentCommand()({id: "AITOOLS"});
            await commands.installAgentCommand()(undefined);

            verify(mockManager.installAgent(anything(), anything())).never();
        });
    });

    describe("addCursorPluginCommand", () => {
        it("prompts the plugin with the 'pluginButton' source", async () => {
            const {commands, mockManager} = setup();
            when(mockManager.addCursorPlugin(anything())).thenResolve();

            await commands.addCursorPluginCommand()();

            const [source] = capture(mockManager.addCursorPlugin).last();
            assert.strictEqual(source, "pluginButton");
        });
    });

    describe("initializeCommand", () => {
        it("shows the install prompt and installs on accept when not installed", async () => {
            const {commands, mockManager, prompter, behaviors} = setup();
            when(mockManager.initialize()).thenResolve("promptInstall");
            when(mockManager.listAgents("global")).thenResolve([]);
            prompter.messageResponses.push("Install AI tools");
            behaviors.push(selectScope("global"));

            await commands.initializeCommand()();

            // Accepting the prompt runs the install flow with the "initModal"
            // source (never the opt-out).
            const [, source] = capture(mockManager.install).last();
            assert.strictEqual(source, "initModal");
            verify(mockManager.optOutOfInstallPrompt()).never();
        });

        it("opts out when the prompt is declined with 'Don't show again'", async () => {
            const {commands, mockManager, prompter} = setup();
            when(mockManager.initialize()).thenResolve("promptInstall");
            when(mockManager.optOutOfInstallPrompt()).thenResolve();
            prompter.messageResponses.push("Don't show again");

            await commands.initializeCommand()();

            verify(mockManager.optOutOfInstallPrompt()).once();
            verify(
                mockManager.install(anything(), anything(), anything())
            ).never();
        });

        it("does not opt out or install on a plain dismissal", async () => {
            const {commands, mockManager, prompter} = setup();
            when(mockManager.initialize()).thenResolve("promptInstall");
            prompter.messageResponses.push(undefined);

            await commands.initializeCommand()();

            verify(mockManager.optOutOfInstallPrompt()).never();
            verify(
                mockManager.install(anything(), anything(), anything())
            ).never();
        });

        it("applies the update when one is available", async () => {
            const {commands, mockManager} = setup();
            when(mockManager.initialize()).thenResolve("update");
            when(mockManager.update(anything())).thenResolve();

            await commands.initializeCommand()();

            verify(mockManager.update(anything())).once();
        });

        it("does nothing when the action is 'none'", async () => {
            const {commands, mockManager} = setup();
            when(mockManager.initialize()).thenResolve("none");

            await commands.initializeCommand()();

            verify(mockManager.update(anything())).never();
            verify(
                mockManager.install(anything(), anything(), anything())
            ).never();
        });

        it("surfaces an error toast instead of throwing on unexpected failure", async () => {
            // Called fire-and-forget on activation, so an unexpected throw must
            // not escape as an unhandled rejection.
            const {commands, mockManager, prompter} = setup();
            when(mockManager.initialize()).thenReject(new Error("unexpected"));

            await assert.doesNotReject(() => commands.initializeCommand()());

            assert.deepStrictEqual(prompter.shownMessages, [
                {
                    message: "Failed to initialize Databricks AI tools.",
                    items: [],
                },
            ]);
        });
    });

    describe("error handling", () => {
        it("surfaces a ProcessError from update as a toast (does not rethrow)", async () => {
            const {commands, mockManager} = setup();
            const err = new ProcessError("boom", 1);
            let shownPrefix: string | undefined;
            err.showErrorMessage = (prefix?: string) => {
                shownPrefix = prefix;
            };
            when(mockManager.update(anything())).thenReject(err);

            // A ProcessError is caught and rendered, not propagated.
            await commands.updateCommand()();

            assert.strictEqual(
                shownPrefix,
                "Failed to update Databricks AI tools."
            );
        });

        it("rethrows a non-ProcessError from update", async () => {
            const {commands, mockManager} = setup();
            when(mockManager.update(anything())).thenReject(
                new Error("unexpected")
            );

            await assert.rejects(
                () => commands.updateCommand()(),
                /unexpected/
            );
        });
    });
});
