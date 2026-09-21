import {expect} from "chai";
import {EventEmitter, ThemeColor, ThemeIcon} from "vscode";
import {
    buildPythonSetupEntry,
    composePythonSetupEntry,
} from "./pythonSetupEntry";

describe("buildPythonSetupEntry", () => {
    const COMMAND = "databricks.environment.setupPythonEnv";
    const RERUN = "databricks.environment.rerunPythonEnv";

    it("renders a run CTA when setup has never completed", () => {
        const [item] = buildPythonSetupEntry(
            {ready: false, driftState: "unset"},
            COMMAND,
            RERUN
        );
        expect(item.command?.command).to.equal(COMMAND);
        expect((item.iconPath as ThemeIcon).id).to.equal("rocket");
        expect((item.iconPath as ThemeIcon).color).to.deep.equal(
            new ThemeColor("errorForeground")
        );
        expect(String(item.label)).to.match(/set up/i);
    });

    it("renders a ready status line (check icon) once setup succeeded", () => {
        const [item] = buildPythonSetupEntry(
            {ready: true, driftState: "unset"},
            COMMAND,
            RERUN
        );
        expect((item.iconPath as ThemeIcon).id).to.equal("check");
        expect(item.command?.command).to.equal(COMMAND);
    });

    it("stays ready across a reload when a prior setup is persisted", () => {
        // The session `ready` flag is false after a reload, but a persisted
        // `ready` drift state (a setup on record that still matches) must keep the
        // row on the "ready" status line instead of reverting to the rocket CTA.
        const [item] = buildPythonSetupEntry(
            {ready: false, driftState: "ready"},
            COMMAND,
            RERUN
        );
        expect((item.iconPath as ThemeIcon).id).to.equal("check");
        expect(String(item.label)).to.match(/ready/i);
    });

    it("renders an out-of-date state that re-runs setup when drifted", () => {
        const [item] = buildPythonSetupEntry(
            {ready: true, driftState: "drifted"},
            COMMAND,
            RERUN
        );
        expect((item.iconPath as ThemeIcon).id).to.equal("warning");
        expect(item.command?.command).to.equal(RERUN);
        expect(String(item.label)).to.match(/out of sync/i);
    });

    it("drift takes precedence over the ready session flag", () => {
        const [item] = buildPythonSetupEntry(
            {ready: true, driftState: "drifted"},
            COMMAND,
            RERUN
        );
        expect((item.iconPath as ThemeIcon).id).to.equal("warning");
        expect(item.command?.command).to.equal(RERUN);
    });

    it("gives the drifted row a distinct id so VS Code rebinds its command", () => {
        // The drifted state points at a different command than ready/set-up; if
        // it reused the same tree-item id, VS Code would not reliably rebind the
        // command on refresh and the re-run click would be inert.
        const [drifted] = buildPythonSetupEntry(
            {ready: true, driftState: "drifted"},
            COMMAND,
            RERUN
        );
        const [ready] = buildPythonSetupEntry(
            {ready: true, driftState: "ready"},
            COMMAND,
            RERUN
        );
        expect(drifted.id).to.not.equal(ready.id);
    });

    it("returns exactly one entry (mutually exclusive with the checklist)", () => {
        expect(
            buildPythonSetupEntry(
                {ready: false, driftState: "unset"},
                COMMAND,
                RERUN
            )
        ).to.have.length(1);
    });
});

describe("composePythonSetupEntry", () => {
    function fakeSetup() {
        const e = new EventEmitter<void>();
        return {
            _e: e,
            ready: false,
            isVisible: async () => true,
            onDidChangeState: e.event,
        };
    }
    function fakeDrift() {
        const e = new EventEmitter<void>();
        return {
            _e: e,
            state: "unset" as "unset" | "ready" | "drifted",
            onDidChangeState: e.event,
        };
    }

    it("forwards ready, driftState and isVisible from the sources", async () => {
        const setup = fakeSetup();
        const drift = fakeDrift();
        const entry = composePythonSetupEntry(setup, drift);

        setup.ready = true;
        drift.state = "drifted";
        expect(entry.ready).to.be.true;
        expect(entry.driftState).to.equal("drifted");
        expect(await entry.isVisible()).to.be.true;
        entry.dispose();
    });

    it("fires onDidChangeState when either source changes", () => {
        const setup = fakeSetup();
        const drift = fakeDrift();
        const entry = composePythonSetupEntry(setup, drift);
        let fired = 0;
        entry.onDidChangeState(() => fired++);

        setup._e.fire();
        drift._e.fire();
        expect(fired).to.equal(2);
        entry.dispose();
    });
});
