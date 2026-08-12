import {expect} from "chai";
import {formatSetupLog, formatSetupNotification} from "./setupSummary";
import {PythonSetupResult} from "../models/PythonSetupResult";
import {
    SUCCESS_DEFAULT,
    SUCCESS_CONSTRAINTS_ONLY,
    SUCCESS_REAL_RUN,
} from "../models/fixtures/setupLocalResults";

describe("formatSetupNotification", () => {
    it("is a concise, use-case-neutral one-liner with no warnings", () => {
        const {message, isWarning} = formatSetupNotification(SUCCESS_DEFAULT);
        expect(message).to.equal(
            "Python environment ready — .venv created and selected for your " +
                "Databricks project."
        );
        expect(isWarning).to.equal(false);
    });

    it("flags the count and marks a warning when warnings are present", () => {
        const warned: PythonSetupResult = {
            ...SUCCESS_DEFAULT,
            warnings: [
                {code: "W_X", message: "pinned an older wheel"},
                {code: "W_Y", message: "used a fallback mirror"},
            ],
        };
        const {message, isWarning} = formatSetupNotification(warned);
        expect(message).to.equal(
            "Python environment ready, with 2 warnings — .venv created and " +
                "selected for your Databricks project."
        );
        expect(isWarning).to.equal(true);
    });

    it("singularizes the count for one warning", () => {
        const warned: PythonSetupResult = {
            ...SUCCESS_DEFAULT,
            warnings: [{code: "W_X", message: "pinned an older wheel"}],
        };
        const {message, isWarning} = formatSetupNotification(warned);
        expect(message).to.contain("with 1 warning —");
        expect(message).to.not.contain("1 warnings");
        expect(isWarning).to.equal(true);
    });
});

describe("formatSetupLog", () => {
    it("is non-empty and self-delimited with leading/trailing newlines", () => {
        const log = formatSetupLog(SUCCESS_DEFAULT);
        expect(log.startsWith("\n")).to.equal(true);
        expect(log.endsWith("\n")).to.equal(true);
        expect(log.trim().length).to.be.greaterThan(0);
    });

    it("includes the versions and capitalized compute label", () => {
        const log = formatSetupLog(SUCCESS_DEFAULT);
        expect(log).to.contain("Python:             3.12");
        expect(log).to.contain("databricks-connect: 17.2.0");
        expect(log).to.contain("Compute:            Serverless v4");
    });

    it("lists what was done, falling back to the bare .venv name", () => {
        const log = formatSetupLog(SUCCESS_DEFAULT);
        expect(log).to.contain(
            "  • Added matching Databricks constraints to pyproject.toml"
        );
        expect(log).to.contain(
            "  • Built a new virtual environment with uv sync called .venv"
        );
        expect(log).to.contain(
            "  • Selected .venv as the workspace interpreter"
        );
    });

    it("shows the project name beside .venv when one is resolved", () => {
        const log = formatSetupLog(SUCCESS_DEFAULT, "my-project", "linux");
        expect(log).to.contain(
            "  • Built a new virtual environment with uv sync called " +
                ".venv (my-project)"
        );
        expect(log).to.contain(
            "  • Selected .venv (my-project) as the workspace interpreter"
        );
        expect(log).to.contain(
            "virtual environment is selected: my-project (`.venv/bin/python`)."
        );
    });

    it("tells the user how to run notebooks with the venv", () => {
        expect(formatSetupLog(SUCCESS_DEFAULT, undefined, "linux")).to.contain(
            "To run notebooks using this virtual environment, click Select " +
                "Kernel in the upper right of a notebook and ensure that the " +
                "virtual environment is selected (`.venv/bin/python`)."
        );
    });

    it("uses the Windows interpreter path in the notebook hint", () => {
        const log = formatSetupLog(SUCCESS_DEFAULT, "my-project", "win32");
        expect(log).to.contain(
            "virtual environment is selected: my-project " +
                "(`.venv\\Scripts\\python.exe`)."
        );
        expect(log).to.not.contain(".venv/bin/python");
    });

    it("drops databricks-connect in constraints-only mode", () => {
        const log = formatSetupLog(SUCCESS_CONSTRAINTS_ONLY);
        expect(log).to.contain(
            "Python environment ready — constraints applied."
        );
        expect(log).to.not.contain("databricks-connect");
    });

    it("shows the backup file on a real run", () => {
        const log = formatSetupLog(SUCCESS_REAL_RUN);
        expect(log).to.contain(
            "  • Backed up your previous pyproject.toml (pyproject.toml.bak)"
        );
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
