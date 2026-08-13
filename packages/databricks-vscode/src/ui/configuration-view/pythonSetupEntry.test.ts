import {expect} from "chai";
import {EventEmitter, ThemeColor, ThemeIcon} from "vscode";
import {
    buildPythonSetupEntry,
    composePythonSetupEntry,
} from "./pythonSetupEntry";

describe("buildPythonSetupEntry", () => {
    const COMMAND = "databricks.environment.setupPythonEnv";
    const RERUN = "databricks.environment.rerunPythonEnv";

    it("renders a run CTA when setup is not yet ready", () => {
        const [item] = buildPythonSetupEntry(
            {ready: false, drifted: false},
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
            {ready: true, drifted: false},
            COMMAND,
            RERUN
        );
        expect((item.iconPath as ThemeIcon).id).to.equal("check");
        expect(item.command?.command).to.equal(COMMAND);
    });

    it("renders an out-of-date state that re-runs setup when drifted", () => {
        const [item] = buildPythonSetupEntry(
            {ready: true, drifted: true},
            COMMAND,
            RERUN
        );
        expect((item.iconPath as ThemeIcon).id).to.equal("warning");
        expect(item.command?.command).to.equal(RERUN);
        expect(String(item.label)).to.match(/out of date/i);
    });

    it("drift takes precedence even when not ready this session", () => {
        const [item] = buildPythonSetupEntry(
            {ready: false, drifted: true},
            COMMAND,
            RERUN
        );
        expect((item.iconPath as ThemeIcon).id).to.equal("warning");
        expect(item.command?.command).to.equal(RERUN);
    });

    it("returns exactly one entry (mutually exclusive with the checklist)", () => {
        expect(
            buildPythonSetupEntry(
                {ready: false, drifted: false},
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
        return {_e: e, drifted: false, onDidChangeState: e.event};
    }

    it("forwards ready, drifted and isVisible from the sources", async () => {
        const setup = fakeSetup();
        const drift = fakeDrift();
        const entry = composePythonSetupEntry(setup, drift);

        setup.ready = true;
        drift.drifted = true;
        expect(entry.ready).to.be.true;
        expect(entry.drifted).to.be.true;
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
