import {
    commandSeparator,
    currentShellKind,
    echoLine,
    ShellKind,
} from "../../utils/shellUtils";

/**
 * uv's official POSIX install script (macOS/Linux), piped into `sh`. Single-
 * sourced here so the terminal command and its test point at the same URL.
 */
export const UV_INSTALL_SCRIPT_POSIX_URL = "https://astral.sh/uv/install.sh";

/** uv's official Windows install script, run through PowerShell's `irm | iex`. */
export const UV_INSTALL_SCRIPT_WINDOWS_URL = "https://astral.sh/uv/install.ps1";

/** The installer's script URL for the platform a shell dialect implies. */
function installerScriptUrl(kind: ShellKind): string {
    return kind === "posix"
        ? UV_INSTALL_SCRIPT_POSIX_URL
        : UV_INSTALL_SCRIPT_WINDOWS_URL;
}

/**
 * The bare installer invocation for a shell dialect — the command that actually
 * downloads and runs uv's official installer.
 *
 * POSIX curls install.sh into `sh`. In PowerShell we `irm | iex` the script
 * directly (execution policy governs script *files*, not a piped string). From
 * cmd there is no `irm`, so we shell out to PowerShell with the documented
 * `-ExecutionPolicy ByPass`, so a restrictive machine default does not block the
 * one-off install.
 */
function uvInstallerInvocation(kind: ShellKind): string {
    switch (kind) {
        case "posix":
            return `curl -LsSf ${UV_INSTALL_SCRIPT_POSIX_URL} | sh`;
        case "powershell":
            return `irm ${UV_INSTALL_SCRIPT_WINDOWS_URL} | iex`;
        case "cmd":
            return `powershell -ExecutionPolicy ByPass -c "irm ${UV_INSTALL_SCRIPT_WINDOWS_URL} | iex"`;
    }
}

/**
 * The full command line to send to a fresh terminal for the "Install uv" action:
 * a short banner explaining what runs, the official installer invocation, then a
 * follow-up telling the user to re-run setup once it finishes.
 *
 * A terminal (not a silent background spawn) is deliberate: the installer's own
 * step-by-step output — and any failure — stays in front of the user, and there
 * is nothing to capture or parse. We do not append `exit`, so that output
 * remains readable after the script completes.
 *
 * The command line is written in the dialect of the shell that will parse it
 * (created without `shellPath`, so `currentShellKind` reports it). Reusing the
 * shared `shellUtils` builders keeps the `curl | sh` / `irm | iex` split and the
 * `;` vs `&` separator correct across macOS, Linux and Windows.
 */
export function uvInstallTerminalCommand(
    kind: ShellKind = currentShellKind()
): string {
    const sep = commandSeparator(kind);
    return [
        echoLine(
            `Installing uv using the official installer (${installerScriptUrl(
                kind
            )}) ...`,
            kind
        ),
        uvInstallerInvocation(kind),
        echoLine("", kind),
        echoLine(
            'When it finishes, re-run "Set up Python environment". You may ' +
                "need to restart VS Code first so uv is found on your PATH.",
            kind
        ),
    ].join(sep);
}
