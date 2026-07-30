/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {
    CancellationToken,
    Progress,
    QuickPick,
    QuickPickItem,
    window,
} from "vscode";
import {anything, capture, instance, mock, verify, when} from "ts-mockito";
import {ProcessError} from "../cli/CliWrapper";
import {
    AiToolsAgentStatus,
    AiToolsManager,
    CURSOR_AGENT_ID,
} from "./AiToolsManager";
import {AiToolsCommands} from "./AiToolsCommands";
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

describe(__filename, () => {
    let mockManager: AiToolsManager;
    let originalCreateQuickPick: typeof window.createQuickPick;
    let originalWithProgress: typeof window.withProgress;
    let originalIsCursor: typeof HostUtils.isCursor;
    let quickPicks: FakeQuickPick[];
    // Behavior applied to each createQuickPick call, in order.
    let behaviors: Array<
        (
            pick: FakeQuickPick
        ) => {selected: readonly QuickPickItem[]} | "dismiss"
    >;
    // A cancellation token whose `isCancellationRequested` is false; enough to
    // stand in for the token withProgress would hand the task.
    const fakeToken = {
        isCancellationRequested: false,
        onCancellationRequested: () => ({dispose() {}}),
    } as unknown as CancellationToken;

    function stubIsCursor(value: boolean) {
        (HostUtils as any).isCursor = () => value;
    }

    beforeEach(() => {
        mockManager = mock(AiToolsManager);
        when(mockManager.hasProjectFolder).thenReturn(true);
        when(mockManager.listAgents(anything())).thenResolve([]);

        quickPicks = [];
        behaviors = [];
        originalCreateQuickPick = window.createQuickPick;
        (window as any).createQuickPick = () => {
            const behavior = behaviors.shift() ?? (() => "dismiss" as const);
            const pick = new FakeQuickPick(behavior);
            quickPicks.push(pick);
            return pick as unknown as QuickPick<QuickPickItem>;
        };

        // Run the progress task synchronously with a non-cancelled token,
        // skipping the real notification UI.
        originalWithProgress = window.withProgress;
        (window as any).withProgress = (
            _options: unknown,
            task: (
                progress: Progress<unknown>,
                token: CancellationToken
            ) => Thenable<unknown>
        ) => task({report() {}}, fakeToken);

        // Default to plain VS Code; Cursor-specific tests opt in.
        originalIsCursor = HostUtils.isCursor;
        stubIsCursor(false);
    });

    afterEach(() => {
        (window as any).createQuickPick = originalCreateQuickPick;
        (window as any).withProgress = originalWithProgress;
        (HostUtils as any).isCursor = originalIsCursor;
    });

    function createCommands() {
        return new AiToolsCommands(instance(mockManager));
    }

    /** Select the scope item matching `scope` in the scope picker. */
    function selectScope(scope: "project" | "global") {
        return (pick: FakeQuickPick) => ({
            selected: [
                pick.items.find(
                    (i) => (i as any).scope === scope
                ) as QuickPickItem,
            ],
        });
    }

    it("shows the agent picker after the scope picker and passes the selection to install", async () => {
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

        await createCommands().installCommand()("sidePane");

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
        when(mockManager.listAgents("global")).thenResolve([
            agent("claude-code", "Claude Code", true),
            agent("cursor", "Cursor", false),
            agent("codex", "Codex CLI", true),
        ]);
        behaviors.push(selectScope("global"));
        behaviors.push((pick) => ({selected: pick.selectedItems}));

        await createCommands().installCommand()("sidePane");

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
        when(mockManager.listAgents("global")).thenResolve([
            agent("claude-code", "Claude Code", false),
            agent(CURSOR_AGENT_ID, "Cursor", false),
        ]);
        behaviors.push(selectScope("global"));
        behaviors.push((pick) => ({selected: pick.selectedItems}));

        await createCommands().installCommand()("sidePane");

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
        when(mockManager.listAgents("global")).thenResolve([
            agent(CURSOR_AGENT_ID, "Cursor", false),
        ]);
        behaviors.push(selectScope("global"));
        behaviors.push((pick) => ({selected: pick.selectedItems}));

        await createCommands().installCommand()("sidePane");

        const agentPick = quickPicks[1];
        assert.deepStrictEqual(agentPick.selectedItems, []);
    });

    it("installs the user's edited selection, not just the detected agents", async () => {
        when(mockManager.listAgents("global")).thenResolve([
            agent("claude-code", "Claude Code", true),
            agent("cursor", "Cursor", false),
        ]);
        behaviors.push(selectScope("global"));
        // User deselects the detected agent and picks the undetected one.
        behaviors.push((pick) => ({
            selected: pick.items.filter((i) => (i as any).agentId === "cursor"),
        }));

        await createCommands().installCommand()("sidePane");

        const [, , agents] = capture(mockManager.install).last();
        assert.deepStrictEqual(agents, ["cursor"]);
    });

    it("skips the agent picker and installs with an empty selection when no agents are reported", async () => {
        when(mockManager.listAgents("global")).thenResolve([]);
        behaviors.push(selectScope("global"));

        await createCommands().installCommand()("sidePane");

        // Only the scope picker is created; the agent picker is skipped.
        assert.strictEqual(quickPicks.length, 1);
        const [scope, , agents] = capture(mockManager.install).last();
        assert.strictEqual(scope, "global");
        assert.deepStrictEqual(agents, []);
    });

    it("cancels the install when the agent picker is dismissed", async () => {
        when(mockManager.listAgents("global")).thenResolve([
            agent("claude-code", "Claude Code", true),
        ]);
        behaviors.push(selectScope("global"));
        behaviors.push(() => "dismiss");

        await createCommands().installCommand()("sidePane");

        verify(mockManager.install(anything(), anything(), anything())).never();
    });

    it("does not show the agent picker when the scope picker is dismissed", async () => {
        behaviors.push(() => "dismiss");

        await createCommands().installCommand()("sidePane");

        assert.strictEqual(quickPicks.length, 1);
        verify(mockManager.listAgents(anything())).never();
        verify(mockManager.install(anything(), anything(), anything())).never();
    });

    it("lists agents for the chosen scope", async () => {
        when(mockManager.listAgents("project")).thenResolve([
            agent("claude-code", "Claude Code", true),
        ]);
        behaviors.push(selectScope("project"));
        behaviors.push((pick) => ({selected: pick.selectedItems}));

        await createCommands().installCommand()("sidePane");

        verify(mockManager.listAgents("project")).once();
    });

    describe("installAgentCommand", () => {
        it("installs the agent recovered from the tree node id", async () => {
            when(
                mockManager.installAgent(anything(), anything())
            ).thenResolve();

            await createCommands().installAgentCommand()({
                id: "AITOOLS.agent.codex",
            });

            const [agentId] = capture(mockManager.installAgent).last();
            assert.strictEqual(agentId, "codex");
        });

        it("ignores a node without an agent id", async () => {
            await createCommands().installAgentCommand()({id: "AITOOLS"});
            await createCommands().installAgentCommand()(undefined);

            verify(mockManager.installAgent(anything(), anything())).never();
        });
    });

    describe("addCursorPluginCommand", () => {
        it("prompts the plugin with the 'pluginButton' source", async () => {
            when(mockManager.addCursorPlugin(anything())).thenResolve();

            await createCommands().addCursorPluginCommand()();

            const [source] = capture(mockManager.addCursorPlugin).last();
            assert.strictEqual(source, "pluginButton");
        });
    });

    describe("initializeCommand", () => {
        it("shows the install prompt and installs on accept when not installed", async () => {
            when(mockManager.initialize()).thenResolve("promptInstall");
            when(mockManager.listAgents("global")).thenResolve([]);
            const originalShowInfo = window.showInformationMessage;
            (window as any).showInformationMessage = async () =>
                "Install AI tools";
            behaviors.push(selectScope("global"));
            try {
                await createCommands().initializeCommand()();
            } finally {
                (window as any).showInformationMessage = originalShowInfo;
            }

            // Accepting the prompt runs the install flow with the "initModal"
            // source (never the opt-out).
            const [, source] = capture(mockManager.install).last();
            assert.strictEqual(source, "initModal");
            verify(mockManager.optOutOfInstallPrompt()).never();
        });

        it("opts out when the prompt is declined with 'Don't show again'", async () => {
            when(mockManager.initialize()).thenResolve("promptInstall");
            when(mockManager.optOutOfInstallPrompt()).thenResolve();
            const originalShowInfo = window.showInformationMessage;
            (window as any).showInformationMessage = async () =>
                "Don't show again";
            try {
                await createCommands().initializeCommand()();
            } finally {
                (window as any).showInformationMessage = originalShowInfo;
            }

            verify(mockManager.optOutOfInstallPrompt()).once();
            verify(
                mockManager.install(anything(), anything(), anything())
            ).never();
        });

        it("does not opt out or install on a plain dismissal", async () => {
            when(mockManager.initialize()).thenResolve("promptInstall");
            const originalShowInfo = window.showInformationMessage;
            (window as any).showInformationMessage = async () => undefined;
            try {
                await createCommands().initializeCommand()();
            } finally {
                (window as any).showInformationMessage = originalShowInfo;
            }

            verify(mockManager.optOutOfInstallPrompt()).never();
            verify(
                mockManager.install(anything(), anything(), anything())
            ).never();
        });

        it("applies the update when one is available", async () => {
            when(mockManager.initialize()).thenResolve("update");
            when(mockManager.update(anything())).thenResolve();

            await createCommands().initializeCommand()();

            verify(mockManager.update(anything())).once();
        });

        it("does nothing when the action is 'none'", async () => {
            when(mockManager.initialize()).thenResolve("none");

            await createCommands().initializeCommand()();

            verify(mockManager.update(anything())).never();
            verify(
                mockManager.install(anything(), anything(), anything())
            ).never();
        });
    });

    describe("error handling", () => {
        it("surfaces a ProcessError from update as a toast (does not rethrow)", async () => {
            const err = new ProcessError("boom", 1);
            let shownPrefix: string | undefined;
            err.showErrorMessage = (prefix?: string) => {
                shownPrefix = prefix;
            };
            when(mockManager.update(anything())).thenReject(err);

            // A ProcessError is caught and rendered, not propagated.
            await createCommands().updateCommand()();

            assert.strictEqual(
                shownPrefix,
                "Failed to update Databricks AI tools."
            );
        });

        it("rethrows a non-ProcessError from update", async () => {
            when(mockManager.update(anything())).thenReject(
                new Error("unexpected")
            );

            await assert.rejects(
                () => createCommands().updateCommand()(),
                /unexpected/
            );
        });
    });
});
