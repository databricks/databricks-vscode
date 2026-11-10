import { describe, expect, it } from "vitest";
import { StateStore } from "../../platform/state";
import { fakeMemento } from "../../test-support/fakes";
import { WORKSPACE_IDS_BY_HOST, WorkspaceIdLedger } from "./WorkspaceIds";

const ALIAS = "https://unified-alias.databricks.com";

describe("WorkspaceIdLedger", () => {
    it("records what a host served, by its normalised name, newest last, once each", async () => {
        const state = new StateStore({ global: fakeMemento(), workspace: fakeMemento() });
        const ledger = new WorkspaceIdLedger(state);
        await ledger.record(`${ALIAS}/`, "1");
        await ledger.record(ALIAS.toUpperCase(), "2");
        await ledger.record(ALIAS, "1");
        expect(ledger.read()).toEqual(new Map([[ALIAS, ["2", "1"]]]));
        expect(state.get(WORKSPACE_IDS_BY_HOST)).toEqual({ [ALIAS]: ["2", "1"] });
    });

    it("records no host outside Databricks' domains", async () => {
        const ledger = new WorkspaceIdLedger(
            new StateStore({ global: fakeMemento(), workspace: fakeMemento() }),
        );
        await ledger.record("https://databricks.example.com", "1");
        expect(ledger.read()).toEqual(new Map());
    });

    it("keeps the last ten IDs of a host", async () => {
        const ledger = new WorkspaceIdLedger(
            new StateStore({ global: fakeMemento(), workspace: fakeMemento() }),
        );
        for (let i = 0; i < 12; i++) {
            await ledger.record(ALIAS, String(i));
        }
        expect(ledger.read().get(ALIAS)).toEqual([
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "10",
            "11",
        ]);
    });
});
