import {expect} from "chai";
import {formatSetupLog, formatSetupSummary} from "./setupSummary";
import {PythonSetupResult} from "../models/PythonSetupResult";
import {
    SUCCESS_DEFAULT,
    SUCCESS_CONSTRAINTS_ONLY,
    SUCCESS_REAL_RUN,
} from "../models/fixtures/setupLocalResults";

describe("formatSetupSummary", () => {
    it("titles a default-mode run for Databricks Connect", () => {
        const {title} = formatSetupSummary(SUCCESS_DEFAULT);
        expect(title).to.equal(
            "Python environment ready for Databricks Connect"
        );
    });

    it("leads with the python and databricks-connect versions", () => {
        const {detail} = formatSetupSummary(SUCCESS_DEFAULT);
        expect(detail).to.contain("✓ Python 3.12 + databricks-connect 17.2.0");
    });

    it("itemizes the constraints/uv sync and interpreter steps", () => {
        const {detail} = formatSetupSummary(SUCCESS_DEFAULT);
        expect(detail).to.contain(
            "✓ Added matching constraints, built .venv (uv sync)"
        );
        expect(detail).to.contain("✓ Selected .venv as the interpreter");
    });

    it("drops the databricks-connect clause in constraints-only mode", () => {
        const {title, detail} = formatSetupSummary(SUCCESS_CONSTRAINTS_ONLY);
        expect(title).to.equal(
            "Python environment ready — constraints applied"
        );
        expect(detail).to.contain("✓ Python 3.12");
        expect(detail).to.not.contain("databricks-connect");
    });

    it("renders the full default-mode detail body verbatim", () => {
        const {detail} = formatSetupSummary(SUCCESS_DEFAULT);
        expect(detail).to.equal(
            "✓ Python 3.12 + databricks-connect 17.2.0\n" +
                "✓ Added matching constraints, built .venv (uv sync)\n" +
                "✓ Selected .venv as the interpreter"
        );
    });

    it("flags warnings with a single count line when present", () => {
        const warned: PythonSetupResult = {
            ...SUCCESS_DEFAULT,
            warnings: [
                {code: "W_X", message: "pinned an older wheel"},
                {code: "W_Y", message: "used a fallback mirror"},
            ],
        };
        const {detail} = formatSetupSummary(warned);
        expect(detail).to.contain("⚠ Completed with 2 warnings — see logs");
    });

    it("singularizes the warning-count line for one warning", () => {
        const warned: PythonSetupResult = {
            ...SUCCESS_DEFAULT,
            warnings: [{code: "W_X", message: "pinned an older wheel"}],
        };
        const {detail} = formatSetupSummary(warned);
        expect(detail).to.contain("⚠ Completed with 1 warning — see logs");
    });

    it("omits the warnings line when there are none", () => {
        const {detail} = formatSetupSummary(SUCCESS_DEFAULT);
        expect(detail).to.not.contain("⚠");
    });
});

describe("formatSetupLog", () => {
    it("is non-empty and self-delimited with leading/trailing newlines", () => {
        const log = formatSetupLog(SUCCESS_DEFAULT);
        expect(log.startsWith("\n")).to.equal(true);
        expect(log.endsWith("\n")).to.equal(true);
        expect(log.trim().length).to.be.greaterThan(0);
    });

    it("includes the versions, compute and artifact source", () => {
        const log = formatSetupLog(SUCCESS_DEFAULT);
        expect(log).to.contain("Python:             3.12");
        expect(log).to.contain("databricks-connect: 17.2.0");
        expect(log).to.contain("Compute:            serverless v4");
        expect(log).to.contain("Packages:           downloaded from network");
    });

    it("lists what was done", () => {
        const log = formatSetupLog(SUCCESS_DEFAULT);
        expect(log).to.contain(
            "  • Added matching Databricks constraints to pyproject.toml"
        );
        expect(log).to.contain(
            "  • Built the virtual environment with uv sync"
        );
        expect(log).to.contain(
            "  • Selected .venv as the workspace interpreter"
        );
    });

    it("reuses-from-cache wording when artifacts came from cache", () => {
        const cached: PythonSetupResult = {
            ...SUCCESS_DEFAULT,
            resolved: {...SUCCESS_DEFAULT.resolved!, artifactSource: "cache"},
        };
        expect(formatSetupLog(cached)).to.contain(
            "Packages:           reused from cache"
        );
    });

    it("drops databricks-connect in constraints-only mode", () => {
        const log = formatSetupLog(SUCCESS_CONSTRAINTS_ONLY);
        expect(log).to.contain(
            "Python environment ready — constraints applied."
        );
        expect(log).to.not.contain("databricks-connect");
    });

    it("shows the backup file and venv path on a real run", () => {
        const log = formatSetupLog(SUCCESS_REAL_RUN);
        expect(log).to.contain(
            "  • Backed up your previous pyproject.toml (pyproject.toml.bak)"
        );
        expect(log).to.contain("Virtual environment: /home/user/project/.venv");
    });

    it("omits the backup line when nothing was backed up", () => {
        const noBackup: PythonSetupResult = {
            ...SUCCESS_REAL_RUN,
            backupPath: undefined,
        };
        expect(formatSetupLog(noBackup)).to.not.contain("Backed up");
    });

    it("lists full warning messages when present", () => {
        const warned: PythonSetupResult = {
            ...SUCCESS_DEFAULT,
            warnings: [{code: "W_X", message: "pinned an older wheel"}],
        };
        const log = formatSetupLog(warned);
        expect(log).to.contain("Warnings:");
        expect(log).to.contain("  • pinned an older wheel");
    });
});
