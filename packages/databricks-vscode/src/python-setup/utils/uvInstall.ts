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

/** The installer's script URL for the host platform (used only in the banner). */
function installerScriptUrl(platform: NodeJS.Platform): string {
    return platform === "win32"
        ? UV_INSTALL_SCRIPT_WINDOWS_URL
        : UV_INSTALL_SCRIPT_POSIX_URL;
}

/**
 * The bare installer invocation — the command that actually downloads and runs
 * uv's official installer.
 *
 * The installer OS is chosen by the host `platform`, NOT the shell dialect: on
 * Windows a Git Bash / WSL default terminal is posix *syntax* but the extension
 * host (and `setup-local`) still run on Windows, so uv must be the Windows build
 * or the newly-installed binary would be invisible to setup. From such a posix
 * shell — and from cmd — we reach the Windows installer through `powershell.exe`
 * (`.exe` so WSL interop resolves it) with the documented `-ExecutionPolicy
 * ByPass`, so a restrictive machine default does not block the one-off install.
 * Inside PowerShell itself we `irm | iex` directly (execution policy governs
 * script *files*, not a piped string). On macOS/Linux we curl install.sh into sh.
 */
function uvInstallerInvocation(
    kind: ShellKind,
    platform: NodeJS.Platform
): string {
    if (platform !== "win32") {
        return `curl -LsSf ${UV_INSTALL_SCRIPT_POSIX_URL} | sh`;
    }
    return kind === "powershell"
        ? `irm ${UV_INSTALL_SCRIPT_WINDOWS_URL} | iex`
        : `powershell.exe -ExecutionPolicy ByPass -c "irm ${UV_INSTALL_SCRIPT_WINDOWS_URL} | iex"`;
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
 * Two independent axes: the command-line *syntax* (separator, echo) follows the
 * shell dialect `kind` (created without `shellPath`, so `currentShellKind`
 * reports it), while the installer *OS* follows the host `platform` — see
 * {@link uvInstallerInvocation}. Reusing the shared `shellUtils` builders keeps
 * both correct across macOS, Linux and Windows.
 */
export function uvInstallTerminalCommand(
    kind: ShellKind = currentShellKind(),
    platform: NodeJS.Platform = process.platform
): string {
    const sep = commandSeparator(kind);
    return [
        echoLine(
            `Installing uv using the official installer (${installerScriptUrl(
                platform
            )}) ...`,
            kind
        ),
        uvInstallerInvocation(kind, platform),
        echoLine("", kind),
        echoLine(
            'When it finishes, re-run "Set up Python environment". You may ' +
                "need to restart VS Code first so uv is found on your PATH.",
            kind
        ),
    ].join(sep);
}

/** Label on the confirm button of the install-uv modal (also its return value). */
export const UV_INSTALL_CONFIRM_ACTION = "Install uv";

/**
 * Modal body shown before the installer runs. The user already clicked
 * "Install uv", but running a remote install script is worth one explicit,
 * informed confirmation — it names the source and says code will execute.
 */
export const UV_INSTALL_CONFIRM_MESSAGE =
    "This downloads and runs uv's official installer from astral.sh in a " +
    "terminal, executing its script on your machine. Continue?";

/**
 * How to open the "Install uv" terminal: VS Code `createTerminal` options plus
 * the matching command line. Pure (platform-only) so the extension's command
 * handler stays thin and the Windows/POSIX split is unit-tested.
 *
 * On Windows the terminal is pinned to `powershell.exe` rather than the user's
 * default profile: a WSL / Git Bash default can have Windows interop disabled,
 * which would strand the Windows uv the extension host needs. A throwaway
 * install terminal needs no profile args, so pinning is safe here. On
 * macOS/Linux the default profile is used, and its actual dialect drives the
 * command syntax — `kind` is `powershell` when the user runs `pwsh`, not just
 * `posix` — so the command parses in whatever shell that profile launches.
 */
export interface UvInstallTerminalSpec {
    name: string;
    shellPath?: string;
    command: string;
}

export function uvInstallTerminalSpec(
    platform: NodeJS.Platform = process.platform,
    kind: ShellKind = currentShellKind()
): UvInstallTerminalSpec {
    if (platform === "win32") {
        return {
            name: "Install uv",
            shellPath: "powershell.exe",
            command: uvInstallTerminalCommand("powershell", platform),
        };
    }
    return {
        name: "Install uv",
        command: uvInstallTerminalCommand(kind, platform),
    };
}
