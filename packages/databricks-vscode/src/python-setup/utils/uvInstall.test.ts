import {expect} from "chai";
import {
    runUvInstall,
    UV_INSTALL_SCRIPT_POSIX_URL,
    UV_INSTALL_SCRIPT_WINDOWS_URL,
    UvInstallTerminalSpec,
    uvInstallTerminalCommand,
    uvInstallTerminalSpec,
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

    it("still curls the POSIX installer, in PowerShell syntax, for pwsh on macOS/Linux", () => {
        // A pwsh default profile on macOS/Linux: the installer stays the POSIX
        // curl | sh (uv is a *nix build there), but the banner must be
        // PowerShell syntax so the whole line parses.
        const cmd = uvInstallTerminalCommand("powershell", "darwin");
        expect(cmd).to.contain(
            `curl -LsSf ${UV_INSTALL_SCRIPT_POSIX_URL} | sh`
        );
        expect(cmd).to.contain("Write-Host");
        expect(cmd).to.not.contain("install.ps1");
    });

    const allShapes = [
        ["posix", "darwin"],
        ["posix", "linux"],
        ["powershell", "darwin"],
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

describe("uvInstallTerminalSpec", () => {
    it("pins a PowerShell terminal on Windows so it does not depend on the default profile", () => {
        // A WSL / Git Bash default profile can have Windows interop disabled,
        // which would strand the Windows uv. Pinning powershell.exe sidesteps
        // that, and the command is the direct PowerShell irm | iex.
        const spec = uvInstallTerminalSpec("win32");
        expect(spec.shellPath).to.equal("powershell.exe");
        expect(spec.name).to.equal("Install uv");
        expect(spec.command).to.contain(
            `irm ${UV_INSTALL_SCRIPT_WINDOWS_URL} | iex`
        );
        expect(spec.command).to.not.contain("install.sh");
    });

    it("uses the default profile on macOS/Linux (POSIX shell)", () => {
        for (const platform of ["darwin", "linux"] as const) {
            const spec = uvInstallTerminalSpec(platform, "posix");
            expect(spec.shellPath).to.equal(undefined);
            expect(spec.command).to.contain(
                `curl -LsSf ${UV_INSTALL_SCRIPT_POSIX_URL} | sh`
            );
        }
    });

    it("matches the dialect when the default macOS/Linux profile is pwsh", () => {
        // A pwsh default profile on macOS/Linux runs PowerShell syntax; the
        // command must use it (Write-Host, not printf) while still curling the
        // POSIX installer — otherwise the banner lines fail to parse.
        const spec = uvInstallTerminalSpec("darwin", "powershell");
        expect(spec.shellPath).to.equal(undefined);
        expect(spec.command).to.contain(
            `curl -LsSf ${UV_INSTALL_SCRIPT_POSIX_URL} | sh`
        );
        expect(spec.command).to.contain("Write-Host");
        expect(spec.command).to.not.contain("printf");
    });
});

describe("runUvInstall", () => {
    it("opens the install terminal after the user confirms", async () => {
        const opened: UvInstallTerminalSpec[] = [];
        await runUvInstall({
            confirm: async () => true,
            openTerminal: (spec) => opened.push(spec),
        });
        expect(opened).to.have.length(1);
        expect(opened[0].name).to.equal("Install uv");
    });

    it("opens nothing when the user dismisses the confirmation", async () => {
        let opened = false;
        await runUvInstall({
            confirm: async () => false,
            openTerminal: () => {
                opened = true;
            },
        });
        expect(opened).to.equal(false);
    });
});
