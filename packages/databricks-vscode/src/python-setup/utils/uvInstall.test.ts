import {expect} from "chai";
import {
    UV_INSTALL_SCRIPT_POSIX_URL,
    UV_INSTALL_SCRIPT_WINDOWS_URL,
    uvInstallTerminalCommand,
} from "./uvInstall";

describe("uvInstallTerminalCommand", () => {
    it("curls the official install.sh into sh on POSIX shells", () => {
        const cmd = uvInstallTerminalCommand("posix");
        expect(cmd).to.contain(
            `curl -LsSf ${UV_INSTALL_SCRIPT_POSIX_URL} | sh`
        );
        // POSIX chains commands with "; ".
        expect(cmd).to.contain("; ");
    });

    it("runs install.ps1 through irm | iex directly in PowerShell", () => {
        const cmd = uvInstallTerminalCommand("powershell");
        expect(cmd).to.contain(`irm ${UV_INSTALL_SCRIPT_WINDOWS_URL} | iex`);
        // A PowerShell session runs iex directly — no nested powershell.exe.
        expect(cmd).to.not.contain("powershell -ExecutionPolicy");
    });

    it("shells out to PowerShell from cmd (which has no irm)", () => {
        const cmd = uvInstallTerminalCommand("cmd");
        expect(cmd).to.contain(
            `powershell -ExecutionPolicy ByPass -c "irm ${UV_INSTALL_SCRIPT_WINDOWS_URL} | iex"`
        );
        // cmd chains with "& ", not ";".
        expect(cmd).to.contain("& ");
    });

    it("explains the step and points back at the setup entry, in every dialect", () => {
        for (const kind of ["posix", "powershell", "cmd"] as const) {
            const cmd = uvInstallTerminalCommand(kind);
            // A human-readable banner naming the official installer…
            expect(cmd.toLowerCase()).to.contain("uv");
            expect(cmd).to.contain("astral.sh");
            // …and a follow-up pointing at the action to take once it finishes.
            expect(cmd).to.contain("Set up Python environment");
        }
    });

    it("leaves the terminal open so the installer output stays readable", () => {
        // Unlike the az-login flow, we do not close the terminal on completion:
        // the installer's own step-by-step output (and any error) must remain
        // visible for the user to read before they re-run setup.
        for (const kind of ["posix", "powershell", "cmd"] as const) {
            const cmd = uvInstallTerminalCommand(kind);
            expect(cmd).to.not.match(/(^|\s|;|&)exit(\s|;|&|$)/);
        }
    });
});
