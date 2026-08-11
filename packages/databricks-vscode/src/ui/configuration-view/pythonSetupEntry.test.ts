import {expect} from "chai";
import {ThemeColor, ThemeIcon} from "vscode";
import {buildPythonSetupEntry} from "./pythonSetupEntry";

describe("buildPythonSetupEntry", () => {
    const COMMAND = "databricks.environment.setupPythonEnv";

    it("renders a run CTA when setup is not yet ready", () => {
        const [item] = buildPythonSetupEntry({ready: false}, COMMAND);

        expect(item.command?.command).to.equal(COMMAND);
        expect((item.iconPath as ThemeIcon).id).to.equal("rocket");
        // Not-done reads as an error (red), consistent with the sibling
        // checklist entries, rather than the green debug-start color.
        expect((item.iconPath as ThemeIcon).color).to.deep.equal(
            new ThemeColor("errorForeground")
        );
        // The label invites the user to run setup.
        expect(String(item.label)).to.match(/set up/i);
    });

    it("renders a ready status line (check icon) once setup succeeded", () => {
        const [item] = buildPythonSetupEntry({ready: true}, COMMAND);

        expect((item.iconPath as ThemeIcon).id).to.equal("check");
        // Still actionable (re-run), but presented as done.
        expect(item.command?.command).to.equal(COMMAND);
    });

    it("returns exactly one entry (mutually exclusive with the checklist)", () => {
        expect(buildPythonSetupEntry({ready: false}, COMMAND)).to.have.length(
            1
        );
    });
});
