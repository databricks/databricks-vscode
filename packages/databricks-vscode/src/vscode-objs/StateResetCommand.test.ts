import assert from "assert";
import {QuickPickItem, commands, window} from "vscode";
import {anything, capture, instance, mock, verify, when} from "ts-mockito";
import {StateStorage, StorageKey} from "./StateStorage";
import {StateResetCommand} from "./StateResetCommand";

describe(__filename, () => {
    let mockStorage: StateStorage;
    let originalShowQuickPick: typeof window.showQuickPick;
    let originalShowInfo: typeof window.showInformationMessage;
    let originalExecuteCommand: typeof commands.executeCommand;
    let executed: string[];

    // The picker items offered to the user, captured from the last
    // showQuickPick call so tests can inspect ordering/labels.
    let offeredItems: readonly QuickPickItem[];
    // Behavior applied to the (single) showQuickPick call.
    let pickBehavior: (
        items: readonly QuickPickItem[]
    ) => QuickPickItem[] | undefined;
    // Behavior applied to the reload prompt.
    let reloadChoice: string | undefined;

    beforeEach(() => {
        mockStorage = mock(StateStorage);
        when(mockStorage.storageKeys).thenReturn([
            {
                key: "databricks.bundle.target" as StorageKey,
                location: "workspace",
            },
            {
                key: "databricks.aitools.hideInstallPrompt" as StorageKey,
                location: "global",
            },
        ]);
        when(mockStorage.reset(anything())).thenResolve();

        offeredItems = [];
        pickBehavior = () => undefined;
        reloadChoice = undefined;
        executed = [];

        originalShowQuickPick = window.showQuickPick;
        (window as any).showQuickPick = async (items: QuickPickItem[]) => {
            offeredItems = items;
            return pickBehavior(items);
        };
        originalShowInfo = window.showInformationMessage;
        (window as any).showInformationMessage = async () => reloadChoice;
        originalExecuteCommand = commands.executeCommand;
        (commands as any).executeCommand = async (command: string) => {
            executed.push(command);
        };
    });

    afterEach(() => {
        (window as any).showQuickPick = originalShowQuickPick;
        (window as any).showInformationMessage = originalShowInfo;
        (commands as any).executeCommand = originalExecuteCommand;
    });

    function createCommand() {
        return new StateResetCommand(instance(mockStorage));
    }

    it("offers every storage key, sorted by label, with its location", async () => {
        await createCommand().resetCommand()();

        assert.deepStrictEqual(
            offeredItems.map((i) => i.label),
            ["databricks.aitools.hideInstallPrompt", "databricks.bundle.target"]
        );
        assert.deepStrictEqual(
            offeredItems.map((i) => i.description),
            ["global", "workspace"]
        );
    });

    it("resets each selected key and offers a window reload", async () => {
        pickBehavior = (items) =>
            items.filter(
                (i) => i.label === "databricks.aitools.hideInstallPrompt"
            );
        reloadChoice = "Reload Window";

        await createCommand().resetCommand()();

        // `reset` is generic; cast for ts-mockito's capture overload.
        const [resetKey] = capture(mockStorage.reset as any).last();
        assert.strictEqual(resetKey, "databricks.aitools.hideInstallPrompt");
        verify(mockStorage.reset(anything())).once();
        assert.deepStrictEqual(executed, ["workbench.action.reloadWindow"]);
    });

    it("resets all selected keys", async () => {
        pickBehavior = (items) => [...items];

        await createCommand().resetCommand()();

        verify(mockStorage.reset(anything())).twice();
    });

    it("does not reload when the reload prompt is dismissed", async () => {
        pickBehavior = (items) => [items[0]];
        reloadChoice = undefined;

        await createCommand().resetCommand()();

        verify(mockStorage.reset(anything())).once();
        assert.deepStrictEqual(executed, []);
    });

    it("does nothing when the picker is dismissed", async () => {
        pickBehavior = () => undefined;

        await createCommand().resetCommand()();

        verify(mockStorage.reset(anything())).never();
        assert.deepStrictEqual(executed, []);
    });

    it("does nothing when the selection is empty", async () => {
        pickBehavior = () => [];

        await createCommand().resetCommand()();

        verify(mockStorage.reset(anything())).never();
        assert.deepStrictEqual(executed, []);
    });
});
