import {expect} from "chai";
import {
    UV_INSTALL_SCRIPT_POSIX_URL,
    UV_INSTALL_SCRIPT_WINDOWS_URL,
    uvInstallTerminalCommand,
} from "./uvInstall";

describe("uvInstallTerminalCommand", () => {
    it("curls the official install.sh into sh on macOS/Linux", () => {
        for (const platform of ["darwin", "linux"] as const) {
            const cmd = uvInstallTerminalCommand("posix", platform);
            expect(cmd).to.contain(
                `curl -LsSf ${UV_INSTALL_SCRIPT_POSIX_URL} | sh`
            );
            // POSIX chains commands with "; ".
            expect(cmd).to.contain("; ");
            expect(cmd).to.not.contain("install.ps1");
        }
    });

    it("runs install.ps1 through irm | iex directly in a Windows PowerShell terminal", () => {
        const cmd = uvInstallTerminalCommand("powershell", "win32");
        expect(cmd).to.contain(`irm ${UV_INSTALL_SCRIPT_WINDOWS_URL} | iex`);
        // A PowerShell session runs iex directly — no nested powershell.exe.
        expect(cmd).to.not.contain("powershell.exe");
        expect(cmd).to.not.contain("install.sh");
    });

    it("shells out to powershell.exe from a Windows cmd terminal (which has no irm)", () => {
        const cmd = uvInstallTerminalCommand("cmd", "win32");
        expect(cmd).to.contain(
            `powershell.exe -ExecutionPolicy ByPass -c "irm ${UV_INSTALL_SCRIPT_WINDOWS_URL} | iex"`
        );
        // cmd chains with "& ", not ";".
        expect(cmd).to.contain("& ");
    });

    it("installs the Windows uv even from a POSIX-dialect terminal on Windows (Git Bash / WSL)", () => {
        // The installer OS follows the host (process.platform), not the shell
        // dialect: a Git Bash / WSL default profile is posix *syntax*, but the
        // extension host and setup-local still run on Windows — so uv must be
        // the Windows build (reached via powershell.exe interop), never the
        // POSIX install.sh, which would land uv where Windows setup can't see it.
        const cmd = uvInstallTerminalCommand("posix", "win32");
        expect(cmd).to.contain(
            `powershell.exe -ExecutionPolicy ByPass -c "irm ${UV_INSTALL_SCRIPT_WINDOWS_URL} | iex"`
        );
        expect(cmd).to.not.contain("install.sh");
        expect(cmd).to.not.contain("curl ");
        // POSIX syntax still chains with "; ".
        expect(cmd).to.contain("; ");
    });

    const allShapes = [
        ["posix", "darwin"],
        ["posix", "linux"],
        ["powershell", "win32"],
        ["cmd", "win32"],
        ["posix", "win32"],
    ] as const;

    it("explains the step and points back at the setup entry, in every shape", () => {
        for (const [kind, platform] of allShapes) {
            const cmd = uvInstallTerminalCommand(kind, platform);
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
        for (const [kind, platform] of allShapes) {
            const cmd = uvInstallTerminalCommand(kind, platform);
            expect(cmd).to.not.match(/(^|\s|;|&)exit(\s|;|&|$)/);
        }
    });
});
