import {expect} from "chai";
import {formatSetupLog, formatSetupNotification} from "./setupSummary";
import {PythonSetupResult} from "../models/PythonSetupResult";
import {SetupPresetFlags} from "./pythonSetupPresetPicker";
import {
    SUCCESS_DEFAULT,
    SUCCESS_CONSTRAINTS_ONLY,
    SUCCESS_REAL_RUN,
} from "../models/fixtures/setupLocalResults";

// The three presets the picker resolves to, as the skip flags formatSetupLog
// keys its output off (see presetToFlags). Full writes constraints and adds
// databricks-connect; DB Connect adds databricks-connect but no pins; Python
// does neither.
const FULL: SetupPresetFlags = {};
const DB_CONNECT: SetupPresetFlags = {skipConstraints: true};
const PYTHON: SetupPresetFlags = {skipConstraints: true, skipDbconnect: true};

describe("formatSetupNotification", () => {
    it("is a concise, use-case-neutral one-liner with no warnings", () => {
        expect(formatSetupNotification(SUCCESS_DEFAULT)).to.equal(
            "Python environment ready — .venv created and selected for your " +
                "Databricks project."
        );
    });

    it("flags the count in the message when warnings are present", () => {
        const warned: PythonSetupResult = {
            ...SUCCESS_DEFAULT,
            warnings: [
                {code: "W_X", message: "pinned an older wheel"},
                {code: "W_Y", message: "used a fallback mirror"},
            ],
        };
        expect(formatSetupNotification(warned)).to.equal(
            "Python environment ready, with 2 warnings — .venv created and " +
                "selected for your Databricks project."
        );
    });

    it("singularizes the count for one warning", () => {
        const warned: PythonSetupResult = {
            ...SUCCESS_DEFAULT,
            warnings: [{code: "W_X", message: "pinned an older wheel"}],
        };
        const message = formatSetupNotification(warned);
        expect(message).to.contain("with 1 warning —");
        expect(message).to.not.contain("1 warnings");
    });

    it("explains when setup used an installed Python after download failed", () => {
        const fallback = {
            ...SUCCESS_DEFAULT,
            pythonResolution: "installed_fallback",
        } as PythonSetupResult;

        expect(formatSetupNotification(fallback)).to.equal(
            "Python environment ready — Python download failed; used a " +
                "compatible installed Python instead. .venv created and " +
                "selected for your Databricks project."
        );
    });
});

describe("formatSetupLog", () => {
    it("is non-empty and self-delimited with leading/trailing newlines", () => {
        const log = formatSetupLog(SUCCESS_DEFAULT, FULL);
        expect(log.startsWith("\n")).to.equal(true);
        expect(log.endsWith("\n")).to.equal(true);
        expect(log.trim().length).to.be.greaterThan(0);
    });

    it("includes the versions and capitalized compute label", () => {
        const log = formatSetupLog(SUCCESS_DEFAULT, FULL);
        expect(log).to.contain("Python:             3.12");
        expect(log).to.contain("databricks-connect: 17.2.0");
        expect(log).to.contain("Compute:            Serverless v4");
    });

    it("lists what was done, falling back to the bare .venv name", () => {
        const log = formatSetupLog(SUCCESS_DEFAULT, FULL);
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
        const log = formatSetupLog(
            SUCCESS_DEFAULT,
            FULL,
            "my-project",
            "linux"
        );
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
        expect(
            formatSetupLog(SUCCESS_DEFAULT, FULL, undefined, "linux")
        ).to.contain(
            "To run notebooks using this virtual environment, click Select " +
                "Kernel in the upper right of a notebook and ensure that the " +
                "virtual environment is selected (`.venv/bin/python`)."
        );
    });

    it("uses the Windows interpreter path in the notebook hint", () => {
        const log = formatSetupLog(
            SUCCESS_DEFAULT,
            FULL,
            "my-project",
            "win32"
        );
        expect(log).to.contain(
            "virtual environment is selected: my-project " +
                "(`.venv\\Scripts\\python.exe`)."
        );
        expect(log).to.not.contain(".venv/bin/python");
    });

    it("headlines the Full preset for Databricks Connect and reports its pins", () => {
        const log = formatSetupLog(SUCCESS_DEFAULT, FULL);
        expect(log).to.contain(
            "Python environment ready for Databricks Connect."
        );
        expect(log).to.contain("databricks-connect: 17.2.0");
        expect(log).to.contain(
            "  • Added matching Databricks constraints to pyproject.toml"
        );
    });

    it("keeps databricks-connect but drops the pins line for the DB Connect preset", () => {
        // --no-constraints: same CLI result shape as Full (mode "default",
        // databricks-connect resolved), so only the flags tell the panel no
        // pins were written.
        const log = formatSetupLog(SUCCESS_DEFAULT, DB_CONNECT);
        expect(log).to.contain(
            "Python environment ready for Databricks Connect."
        );
        expect(log).to.contain("databricks-connect: 17.2.0");
        expect(log).to.not.contain(
            "Added matching Databricks constraints to pyproject.toml"
        );
    });

    it("drops databricks-connect and the pins line for the Python preset", () => {
        const log = formatSetupLog(SUCCESS_CONSTRAINTS_ONLY, PYTHON);
        expect(log).to.contain("Python environment ready.");
        expect(log).to.not.contain("for Databricks Connect");
        expect(log).to.not.contain("databricks-connect");
        expect(log).to.not.contain(
            "Added matching Databricks constraints to pyproject.toml"
        );
    });

    it("shows the backup file on a real run", () => {
        const log = formatSetupLog(SUCCESS_REAL_RUN, FULL);
        expect(log).to.contain(
            "  • Backed up your previous pyproject.toml (pyproject.toml.bak)"
        );
    });

    it("omits the backup line when nothing was backed up", () => {
        const noBackup: PythonSetupResult = {
            ...SUCCESS_REAL_RUN,
            backupPath: undefined,
        };
        expect(formatSetupLog(noBackup, FULL)).to.not.contain("Backed up");
    });

    it("lists full warning messages when present", () => {
        const warned: PythonSetupResult = {
            ...SUCCESS_DEFAULT,
            warnings: [{code: "W_X", message: "pinned an older wheel"}],
        };
        const log = formatSetupLog(warned, FULL);
        expect(log).to.contain("Warnings:");
        expect(log).to.contain("  • pinned an older wheel");
    });
});
