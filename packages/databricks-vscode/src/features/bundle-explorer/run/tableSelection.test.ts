import { beforeEach, describe, expect, it } from "vitest";
import { fakeShowError } from "../../../test-support/fakes";
import { host as vscode } from "../../../test-support/vscode";
import { createPicks, showTableSelectionQuickPick } from "./tableSelection";

describe("the table selection", () => {
    beforeEach(() => vscode.reset());

    it("lists the known and typed datasets, then the options", () => {
        expect(createPicks(new Set(["a", "b"]), "c, a,").map((p) => p.label)).toEqual([
            "Defaults",
            "c",
            "a",
            "b",
            "Options",
            "Full Refresh",
        ]);
    });

    it("adds the preloaded datasets, and returns the chosen tables", async () => {
        let loaded!: (datasets: Set<string>) => void;
        const choosing = showTableSelectionQuickPick(
            new Set(["a"]),
            new Promise((r) => (loaded = r)),
            fakeShowError(),
        );
        const ui = vscode.quickInputs[0]!;
        expect(ui).toMatchObject({
            title: "Select tables to update",
            canSelectMany: true,
            busy: true,
        });
        loaded(new Set(["b"]));
        await expect.poll(() => ui.busy).toBe(false);
        expect(ui.items.map((i) => i.label)).toEqual([
            "Defaults",
            "a",
            "b",
            "Options",
            "Full Refresh",
        ]);
        ui.acceptSelection(["a", "b"]);
        expect(await choosing).toEqual({ tables: "a,b", fullRefresh: false });
        expect(ui.disposed).toBe(true);
    });

    it("asks before a full refresh, and returns nothing when declined", async () => {
        vscode.nextMessageChoice = "Yes";
        const confirmed = showTableSelectionQuickPick(
            new Set(["a"]),
            Promise.resolve(undefined),
            fakeShowError(),
        );
        vscode.quickInputs[0]!.acceptSelection(["a", "Full Refresh"]);
        expect(await confirmed).toEqual({ tables: "a", fullRefresh: true });
        expect(vscode.warnings.map((w) => [w.message, w.actions])).toEqual([
            ["Are you sure you want to full refresh?", ["Yes", "No"]],
        ]);

        vscode.nextMessageChoice = "No";
        const declined = showTableSelectionQuickPick(
            new Set(["a"]),
            Promise.resolve(undefined),
            fakeShowError(),
        );
        vscode.quickInputs[1]!.acceptSelection(["a", "Full Refresh"]);
        expect(await declined).toEqual({ tables: undefined, fullRefresh: false });
    });

    it("returns nothing when dismissed, and reports a failed preload", async () => {
        const dismissed = showTableSelectionQuickPick(
            new Set(),
            Promise.reject(new Error("no access")),
            fakeShowError(),
        );
        await expect.poll(() => vscode.errors.length).toBe(1);
        expect(vscode.errors[0]!.message).toBe(
            "Failed to load datasets from previous pipeline runs",
        );
        vscode.quickInputs[0]!.hide();
        expect(await dismissed).toEqual({ tables: undefined, fullRefresh: false });
    });
});
