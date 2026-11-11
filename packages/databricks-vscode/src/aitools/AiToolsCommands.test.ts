/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {
    CancellationToken,
    MessageOptions,
    Progress,
    ProgressOptions,
    QuickPick,
    QuickPickItem,
    Terminal,
    TerminalOptions,
} from "vscode";
import {anything, capture, instance, mock, verify, when} from "ts-mockito";
import {ProcessError} from "../cli/CliWrapper";
import {
    AiToolsManager,
    COPILOT_AGENT_ID,
    COPILOT_CLI_NOT_INSTALLED,
    CURSOR_AGENT_ID,
} from "./AiToolsManager";
import {AiToolsAgentStatus, AiToolsModel} from "./AiToolsModel";
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
    private _selectedItems: readonly QuickPickItem[] = [];
    private acceptCbs: Array<() => void> = [];
    private hideCbs: Array<() => void> = [];
    private selectionCbs: Array<(items: readonly QuickPickItem[]) => void> = [];
    public disposed = false;

    constructor(
        private readonly onAccept: (
            pick: FakeQuickPick
        ) => {selected: readonly QuickPickItem[]} | "dismiss"
    ) {}

    // Assigning selectedItems fires onDidChangeSelection, like the real widget,
    // so the picker's enforcement (stripping disabled rows) is exercised.
    get selectedItems(): readonly QuickPickItem[] {
        return this._selectedItems;
    }
    set selectedItems(items: readonly QuickPickItem[]) {
        this._selectedItems = items;
        this.selectionCbs.forEach((cb) => cb(items));
    }

    onDidAccept(cb: () => void) {
        this.acceptCbs.push(cb);
        return {dispose() {}};
    }
    onDidHide(cb: () => void) {
        this.hideCbs.push(cb);
        return {dispose() {}};
    }
    onDidChangeSelection(cb: (items: readonly QuickPickItem[]) => void) {
        this.selectionCbs.push(cb);
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
    detected: boolean,
    supportsProjectScope = true
): AiToolsAgentStatus {
    return {
        id,
        displayName,
        type: detected ? "plugin" : "skills-only",
        detected,
        supportsProjectScope,
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
    readonly shownMessages: Array<{
        message: string;
        items: string[];
        modal?: boolean;
        detail?: string;
    }> = [];

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
        ...items: string[]
    ): Thenable<string | undefined>;
    showInformationMessage(
        message: string,
        options: MessageOptions,
        ...items: string[]
    ): Thenable<string | undefined>;
    showInformationMessage(
        message: string,
        optionsOrItem?: MessageOptions | string,
        ...rest: string[]
    ): Thenable<string | undefined> {
        const options =
            typeof optionsOrItem === "object" ? optionsOrItem : undefined;
        const items =
            typeof optionsOrItem === "string" ? [optionsOrItem, ...rest] : rest;
        this.shownMessages.push({
            message,
            items,
            ...(options ? {modal: options.modal, detail: options.detail} : {}),
        });
        return Promise.resolve(this.messageResponses.shift());
    }

    showWarningMessage(
        message: string,
        ...items: string[]
    ): Thenable<string | undefined>;
    showWarningMessage(
        message: string,
        options: MessageOptions,
        ...items: string[]
    ): Thenable<string | undefined>;
    showWarningMessage(
        message: string,
        optionsOrItem?: MessageOptions | string,
        ...rest: string[]
    ): Thenable<string | undefined> {
        const options =
            typeof optionsOrItem === "object" ? optionsOrItem : undefined;
        const items =
            typeof optionsOrItem === "string" ? [optionsOrItem, ...rest] : rest;
        this.shownMessages.push({
            message,
            items,
            ...(options ? {modal: options.modal, detail: options.detail} : {}),
        });
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
        const options =
            typeof optionsOrItem === "object" ? optionsOrItem : undefined;
        const items =
            typeof optionsOrItem === "string" ? [optionsOrItem, ...rest] : rest;
        this.shownMessages.push({
            message,
            items,
            ...(options ? {modal: options.modal, detail: options.detail} : {}),
        });
        return Promise.resolve(this.messageResponses.shift());
    }

    readonly createdTerminals: TerminalOptions[] = [];
    shownTerminals = 0;
    private closeListeners: Array<(t: Terminal) => unknown> = [];

    // The real API is overloaded; the code under test only uses the options
    // form.
    createTerminal(...args: unknown[]): Terminal {
        this.createdTerminals.push(args[0] as TerminalOptions);
        const terminal = {
            show: () => this.shownTerminals++,
        } as unknown as Terminal;
        this.terminals.push(terminal);
        return terminal;
    }
    readonly terminals: Terminal[] = [];

    onDidCloseTerminal = ((listener: (t: Terminal) => unknown) => {
        this.closeListeners.push(listener);
        return {
            dispose: () => {
                this.closeListeners = this.closeListeners.filter(
                    (l) => l !== listener
                );
            },
        };
    }) as AiToolsPrompter["onDidCloseTerminal"];

    closeTerminal(terminal: Terminal) {
        [...this.closeListeners].forEach((l) => l(terminal));
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
    when(mockManager.copilotCliStatus()).thenResolve("installed");
    when(mockManager.startCopilotCliInstall()).thenReturn(() => {});
    when(mockManager.model).thenReturn(new AiToolsModel("global"));

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
        // Detected agents carry a "Detected" hint; the undetected one is
        // annotated inline with why it can't be selected.
        const detectedHints = agentPick.items.map((i) => i.description);
        assert.deepStrictEqual(detectedHints, [
            "Detected",
            "Not detected",
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
        // Cursor is labelled as the plugin rather than a detected skills
        // install; the undetected Claude row is annotated inline instead.
        const hints = agentPick.items.map((i) => i.description);
        assert.deepStrictEqual(hints, ["Not detected", "Databricks plugin"]);

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

    it("installs the user's edited selection, not just the defaults", async () => {
        const {commands, mockManager, behaviors} = setup();
        when(mockManager.listAgents("global")).thenResolve([
            agent("claude-code", "Claude Code", true),
            agent("codex", "Codex CLI", true),
        ]);
        behaviors.push(selectScope("global"));
        // Both are detected (preselected); the user narrows to just codex.
        behaviors.push((pick) => ({
            selected: pick.items.filter((i) => (i as any).agentId === "codex"),
        }));

        await commands.installCommand()("sidePane");

        const [, , agents] = capture(mockManager.install).last();
        assert.deepStrictEqual(agents, ["codex"]);
    });

    it("disables undetected agents with an explanation and won't select them", async () => {
        const {commands, mockManager, behaviors, quickPicks} = setup();
        when(mockManager.listAgents("global")).thenResolve([
            agent("claude-code", "Claude Code", true),
            agent("gemini", "Gemini CLI", false),
        ]);
        behaviors.push(selectScope("global"));
        // The user tries to also check the undetected agent; it must be stripped.
        behaviors.push((pick) => ({selected: pick.items}));

        await commands.installCommand()("sidePane");

        const agentPick = quickPicks[1];
        const gemini = agentPick.items.find(
            (i) => (i as any).agentId === "gemini"
        )!;
        assert.strictEqual((gemini as any).disabled, true);
        assert.strictEqual(gemini.description, "Not detected");

        // Only the detected agent survives the selection.
        const [, , agents] = capture(mockManager.install).last();
        assert.deepStrictEqual(agents, ["claude-code"]);
    });

    it("disables scope-unsupported agents at project scope", async () => {
        const {commands, mockManager, behaviors, quickPicks} = setup();
        when(mockManager.listAgents("project")).thenResolve([
            agent("claude-code", "Claude Code", true, true),
            // Detected, but only supports global scope.
            agent("codex", "Codex CLI", true, false),
        ]);
        behaviors.push(selectScope("project"));
        behaviors.push((pick) => ({selected: pick.items}));

        await commands.installCommand()("sidePane");

        const agentPick = quickPicks[1];
        const codex = agentPick.items.find(
            (i) => (i as any).agentId === "codex"
        )!;
        assert.strictEqual((codex as any).disabled, true);
        assert.strictEqual(codex.description, "Only supports global scope");

        const [, , agents] = capture(mockManager.install).last();
        assert.deepStrictEqual(agents, ["claude-code"]);
    });

    it("leaves an agent whose CLI isn't installed selectable but unchecked", async () => {
        const {commands, mockManager, behaviors, quickPicks} = setup();
        when(mockManager.listAgents("global")).thenResolve([
            agent("claude-code", "Claude Code", true),
            {
                ...agent(COPILOT_AGENT_ID, "GitHub Copilot", true),
                copilotShim: "/shim/copilot",
            },
        ]);
        behaviors.push(selectScope("global"));
        behaviors.push((pick) => ({selected: pick.selectedItems}));

        await commands.installCommand()("sidePane");

        const copilot = quickPicks[1].items.find(
            (i) => (i as any).agentId === COPILOT_AGENT_ID
        )!;
        assert.strictEqual((copilot as any).disabled, false);
        assert.strictEqual(
            copilot.description,
            "GitHub Copilot CLI not installed"
        );
        const [, , agents] = capture(mockManager.install).last();
        assert.deepStrictEqual(agents, ["claude-code"]);
    });

    it("allows a scope-unsupported agent at global scope", async () => {
        const {commands, mockManager, behaviors, quickPicks} = setup();
        when(mockManager.listAgents("global")).thenResolve([
            // Detected and only supports global scope: selectable at global.
            agent("codex", "Codex CLI", true, false),
        ]);
        behaviors.push(selectScope("global"));
        behaviors.push((pick) => ({selected: pick.selectedItems}));

        await commands.installCommand()("sidePane");

        const agentPick = quickPicks[1];
        const codex = agentPick.items[0];
        assert.strictEqual((codex as any).disabled, false);
        assert.strictEqual(codex.description, "Detected");

        const [, , agents] = capture(mockManager.install).last();
        assert.deepStrictEqual(agents, ["codex"]);
    });

    it("aborts install and shows an error when no agents are reported", async () => {
        const {commands, mockManager, behaviors, quickPicks, prompter} =
            setup();
        when(mockManager.listAgents("global")).thenResolve([]);
        behaviors.push(selectScope("global"));

        await commands.installCommand()("sidePane");

        // Only the scope picker is created; the agent picker is skipped.
        assert.strictEqual(quickPicks.length, 1);
        verify(mockManager.install(anything(), anything(), anything())).never();
        assert.match(
            prompter.shownMessages[0].message,
            /Failed to load Databricks AI tools installer/i
        );
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

    describe("Copilot CLI check", () => {
        const SHIM =
            "/Applications/Visual Studio Code.app/bin/copilot-shim/copilot";
        const shim = {shim: SHIM};
        const INSTALL_CLI = "Install GitHub Copilot CLI";
        const SKIPPED = {[COPILOT_AGENT_ID]: COPILOT_CLI_NOT_INSTALLED};

        function setupWithCopilot(
            agentIds = ["claude-code", COPILOT_AGENT_ID]
        ) {
            const ctx = setup();
            when(ctx.mockManager.listAgents("global")).thenResolve(
                agentIds.map((id) => agent(id, id, true))
            );
            ctx.behaviors.push(selectScope("global"));
            ctx.behaviors.push((pick) => ({selected: pick.selectedItems}));
            return ctx;
        }

        function copilotWarnings(prompter: FakePrompter) {
            return prompter.shownMessages.filter((m) =>
                m.message.includes("GitHub Copilot CLI is not installed")
            );
        }

        function installedPrompts(prompter: FakePrompter) {
            return prompter.shownMessages.filter((m) =>
                m.message.startsWith("GitHub Copilot CLI is installed.")
            );
        }

        // Let fire-and-forget follow-ups run.
        const settle = async () => {
            for (let i = 0; i < 10; i++) {
                await new Promise((r) => setImmediate(r));
            }
        };

        it("runs the shim as the installer terminal's process", async () => {
            const {commands, mockManager, prompter} = setupWithCopilot();
            when(mockManager.copilotCliStatus()).thenResolve(shim);
            prompter.messageResponses.push(INSTALL_CLI);

            await commands.installCommand()("sidePane");
            await settle();

            assert.strictEqual(prompter.createdTerminals.length, 1);
            const [options] = prompter.createdTerminals;
            assert.strictEqual(options.shellPath, SHIM);
            assert.deepStrictEqual(options.shellArgs, ["--version"]);
            assert.strictEqual(options.hideFromUser, true);
            assert.strictEqual(prompter.shownTerminals, 1);
        });

        describe("batch install", () => {
            it("installs Copilot when GitHub Copilot CLI is installed", async () => {
                const {commands, mockManager, prompter} = setupWithCopilot();

                await commands.installCommand()("sidePane");

                const [, , agents, , skipped] = capture(
                    mockManager.install
                ).last();
                assert.deepStrictEqual(agents, [
                    "claude-code",
                    COPILOT_AGENT_ID,
                ]);
                assert.strictEqual(skipped, undefined);
                assert.deepStrictEqual(copilotWarnings(prompter), []);
            });

            it("skips Copilot behind the shim and warns with a non-modal CTA", async () => {
                const {commands, mockManager, prompter} = setupWithCopilot();
                when(mockManager.copilotCliStatus()).thenResolve(shim);

                await commands.installCommand()("sidePane");

                const [, , agents, , skipped] = capture(
                    mockManager.install
                ).last();
                assert.deepStrictEqual(agents, ["claude-code"]);
                assert.deepStrictEqual(skipped, SKIPPED);
                const [warning] = copilotWarnings(prompter);
                assert.ok(warning);
                assert.notStrictEqual(warning.modal, true);
                assert.ok(warning.message.endsWith("then try again."));
                assert.deepStrictEqual(warning.items, [INSTALL_CLI]);
                // Nothing runs unless the user asks.
                assert.strictEqual(prompter.createdTerminals.length, 0);
            });

            it("offers to install Copilot once the installer succeeds", async () => {
                const {commands, mockManager, prompter} = setupWithCopilot();
                when(mockManager.copilotCliStatus()).thenResolve(
                    shim,
                    "installed"
                );
                const recorded: unknown[] = [];
                when(mockManager.startCopilotCliInstall()).thenReturn((p) =>
                    recorded.push(p)
                );
                prompter.messageResponses.push(INSTALL_CLI, "Install");

                await commands.installCommand()("sidePane");
                await settle();
                assert.deepStrictEqual(installedPrompts(prompter), []);
                prompter.closeTerminal(prompter.terminals[0]);
                await settle();

                assert.deepStrictEqual(recorded, [{installed: true}]);
                assert.strictEqual(installedPrompts(prompter).length, 1);
                const [scope, source, agents, , skipped] = capture(
                    mockManager.install
                ).last();
                assert.deepStrictEqual(
                    [scope, source, agents, skipped],
                    ["global", "sidePane", [COPILOT_AGENT_ID], undefined]
                );
            });

            it("offers nothing when the installer didn't install the CLI", async () => {
                const {commands, mockManager, prompter} = setupWithCopilot();
                when(mockManager.copilotCliStatus()).thenResolve(shim);
                const recorded: unknown[] = [];
                when(mockManager.startCopilotCliInstall()).thenReturn((p) =>
                    recorded.push(p)
                );
                prompter.messageResponses.push(INSTALL_CLI);

                await commands.installCommand()("sidePane");
                await settle();
                prompter.closeTerminal(prompter.terminals[0]);
                await settle();

                assert.deepStrictEqual(recorded, [{installed: false}]);
                assert.deepStrictEqual(installedPrompts(prompter), []);
            });

            it("does not install Copilot when the user declines afterwards", async () => {
                const {commands, mockManager, prompter} = setupWithCopilot();
                when(mockManager.copilotCliStatus()).thenResolve(
                    shim,
                    "installed"
                );
                // Dismiss the "GitHub Copilot CLI is installed" prompt.
                prompter.messageResponses.push(INSTALL_CLI, undefined);

                await commands.installCommand()("sidePane");
                await settle();
                prompter.closeTerminal(prompter.terminals[0]);
                await settle();

                assert.strictEqual(installedPrompts(prompter).length, 1);
                verify(
                    mockManager.install(
                        anything(),
                        anything(),
                        anything(),
                        anything(),
                        anything()
                    )
                ).once();
            });

            it("reports a failure after the installer terminal closes", async () => {
                const {commands, mockManager, prompter} = setupWithCopilot();
                let calls = 0;
                when(mockManager.copilotCliStatus()).thenCall(async () => {
                    if (calls++ === 0) {
                        return shim;
                    }
                    throw new Error("boom");
                });
                prompter.messageResponses.push(INSTALL_CLI);

                await commands.installCommand()("sidePane");
                await settle();
                prompter.closeTerminal(prompter.terminals[0]);
                await settle();

                assert.ok(
                    prompter.shownMessages.some(
                        (m) =>
                            m.message ===
                            "Failed to install GitHub Copilot CLI."
                    )
                );
            });

            it("ignores other terminals closing", async () => {
                const {commands, mockManager, prompter} = setupWithCopilot();
                when(mockManager.copilotCliStatus()).thenResolve(
                    shim,
                    "installed"
                );
                prompter.messageResponses.push(INSTALL_CLI);

                await commands.installCommand()("sidePane");
                await settle();
                prompter.closeTerminal({} as Terminal);
                await settle();

                verify(mockManager.copilotCliStatus()).once();
            });

            it("does not wait on the notification before installing", async () => {
                const {commands, mockManager, prompter} = setupWithCopilot();
                when(mockManager.copilotCliStatus()).thenResolve(shim);
                // The user never answers the notification.
                prompter.messageResponses.push(new Promise(() => {}) as any);

                await commands.installCommand()("sidePane");

                const [, , agents] = capture(mockManager.install).last();
                assert.deepStrictEqual(agents, ["claude-code"]);
            });

            it("skips Copilot with no CTA when copilot is not on PATH", async () => {
                const {commands, mockManager, prompter} = setupWithCopilot();
                when(mockManager.copilotCliStatus()).thenResolve("missing");

                await commands.installCommand()("sidePane");

                const [, , agents] = capture(mockManager.install).last();
                assert.deepStrictEqual(agents, ["claude-code"]);
                const [warning] = copilotWarnings(prompter);
                assert.ok(warning);
                assert.deepStrictEqual(warning.items, []);
            });

            it("passes the skip on when Copilot was the only agent", async () => {
                const {commands, mockManager, prompter} = setupWithCopilot([
                    COPILOT_AGENT_ID,
                ]);
                when(mockManager.copilotCliStatus()).thenResolve(shim);

                await commands.installCommand()("sidePane");

                // The manager records the skip without running the CLI.
                const [, , agents, , skipped] = capture(
                    mockManager.install
                ).last();
                assert.deepStrictEqual(agents, []);
                assert.deepStrictEqual(skipped, SKIPPED);
                assert.strictEqual(copilotWarnings(prompter).length, 1);
            });

            it("does not check Copilot when it isn't selected", async () => {
                const {commands, mockManager} = setupWithCopilot([
                    "claude-code",
                ]);

                await commands.installCommand()("sidePane");

                verify(mockManager.copilotCliStatus()).never();
            });
        });

        describe("single-agent install", () => {
            const copilotNode = {id: `AITOOLS.agent.${COPILOT_AGENT_ID}`};

            it("installs Copilot when GitHub Copilot CLI is installed", async () => {
                const {commands, mockManager, prompter} = setup();

                await commands.installAgentCommand()(copilotNode);

                const [agentId] = capture(mockManager.installAgent).last();
                assert.strictEqual(agentId, COPILOT_AGENT_ID);
                assert.deepStrictEqual(copilotWarnings(prompter), []);
            });

            it("shows a warning modal and records the skip behind the shim", async () => {
                const {commands, mockManager, prompter} = setup();
                when(mockManager.copilotCliStatus()).thenResolve(shim);

                await commands.installAgentCommand()(copilotNode);

                verify(
                    mockManager.installAgent(anything(), anything())
                ).never();
                verify(
                    mockManager.recordSkippedInstall(
                        "global",
                        "sidePane",
                        anything()
                    )
                ).once();
                const [, , skipped] = capture(
                    mockManager.recordSkippedInstall
                ).last();
                assert.deepStrictEqual(skipped, SKIPPED);
                const [warning] = copilotWarnings(prompter);
                assert.ok(warning);
                assert.strictEqual(warning.modal, true);
                assert.strictEqual(
                    warning.detail,
                    "Install GitHub Copilot CLI, then try again."
                );
                assert.deepStrictEqual(warning.items, [INSTALL_CLI]);
                assert.strictEqual(prompter.createdTerminals.length, 0);
            });

            it("installs Copilot once the installer from the modal succeeds", async () => {
                const {commands, mockManager, prompter} = setup();
                when(mockManager.copilotCliStatus()).thenResolve(
                    shim,
                    "installed"
                );
                prompter.messageResponses.push(INSTALL_CLI, "Install");

                await commands.installAgentCommand()(copilotNode);
                verify(
                    mockManager.installAgent(anything(), anything())
                ).never();
                prompter.closeTerminal(prompter.terminals[0]);
                await settle();

                const [agentId] = capture(mockManager.installAgent).last();
                assert.strictEqual(agentId, COPILOT_AGENT_ID);
            });

            it("records no skip without an install location", async () => {
                const {commands, mockManager, prompter} = setup();
                when(mockManager.copilotCliStatus()).thenResolve(shim);
                when(mockManager.model).thenReturn(new AiToolsModel(undefined));

                await commands.installAgentCommand()(copilotNode);

                verify(
                    mockManager.recordSkippedInstall(
                        anything(),
                        anything(),
                        anything()
                    )
                ).never();
                assert.strictEqual(copilotWarnings(prompter).length, 1);
            });

            it("shows the modal with no CTA when copilot is not on PATH", async () => {
                const {commands, mockManager, prompter} = setup();
                when(mockManager.copilotCliStatus()).thenResolve("missing");

                await commands.installAgentCommand()(copilotNode);

                verify(
                    mockManager.installAgent(anything(), anything())
                ).never();
                const [warning] = copilotWarnings(prompter);
                assert.strictEqual(warning.modal, true);
                assert.deepStrictEqual(warning.items, []);
            });

            it("does not check Copilot for other agents", async () => {
                const {commands, mockManager} = setup();
                when(
                    mockManager.installAgent(anything(), anything())
                ).thenResolve();

                await commands.installAgentCommand()({
                    id: "AITOOLS.agent.codex",
                });

                verify(mockManager.copilotCliStatus()).never();
            });
        });
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
            when(mockManager.listAgents("global")).thenResolve([
                agent("claude-code", "Claude Code", true),
                agent("cursor", "Cursor", true),
                agent("codex", "Codex CLI", true),
            ]);
            prompter.messageResponses.push("Install AI tools");
            behaviors.push(selectScope("global"));
            // select all agents (all detected, so all selectable)
            behaviors.push((pick: FakeQuickPick) => ({selected: pick.items}));

            await commands.initializeCommand()();

            // Accepting the prompt runs the install flow with the "initModal"
            // source (never the opt-out).
            const [scope, source, agents] = capture(mockManager.install).last();
            assert.strictEqual(scope, "global");
            assert.strictEqual(source, "initModal");
            assert.deepEqual(agents, ["claude-code", "cursor", "codex"]);
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
