import {expect} from "chai";
import {formatSetupSummary} from "./setupSummary";
import {PythonSetupResult} from "../models/PythonSetupResult";
import {
    SUCCESS_DEFAULT,
    SUCCESS_CONSTRAINTS_ONLY,
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
