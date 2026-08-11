import {expect} from "chai";
import {SETUP_READY_MESSAGE, formatSetupLog} from "./setupSummary";
import {PythonSetupResult} from "../models/PythonSetupResult";
import {
    SUCCESS_DEFAULT,
    SUCCESS_CONSTRAINTS_ONLY,
    SUCCESS_REAL_RUN,
} from "../models/fixtures/setupLocalResults";

describe("SETUP_READY_MESSAGE", () => {
    it("is a concise, use-case-neutral one-liner", () => {
        expect(SETUP_READY_MESSAGE).to.equal(
            "Python environment ready — .venv created and selected for your " +
                "Databricks project."
        );
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
