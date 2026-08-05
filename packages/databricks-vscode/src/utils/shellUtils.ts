import {env} from "vscode";
import {
    TerminalProfileConfig,
    workspaceConfigs,
} from "../vscode-objs/WorkspaceConfigs";

/**
 * The shell families we generate terminal command strings for. Quoting and
 * built-in command names differ between them, so every helper below branches on
 * this rather than re-inspecting `env.shell`.
 */
export type ShellKind = "cmd" | "powershell" | "posix";

/**
 * Lowercased final path segment of a shell path. Split on both separators
 * explicitly: `path.basename` follows the *host* platform, so it would not
 * split a Windows path when the tests (or a remote extension host) run on
 * POSIX.
 */
function shellBasename(shellPath: string): string {
    return shellPath.toLowerCase().split(/[\\/]/).pop() ?? "";
}

/**
 * Classify a shell from its executable path. `shell` is what VS Code reports as
 * `env.shell`; `platform` gates `cmd`, which only exists on Windows. Both are
 * parameters so the classification is deterministic in tests regardless of the
 * host OS.
 *
 * Matches on the basename, not a substring of the whole path: a path such as
 * `C:\cmder\vendor\git\bin\bash.exe` contains "cmd" but is a POSIX shell.
 *
 * An *empty* shell falls back to the platform default rather than to POSIX:
 * callers cannot pin `shellPath` to `""`, so VS Code launches
 * `terminal.integrated.defaultProfile`, which on Windows is PowerShell. A shell
 * that is named but unrecognised still resolves to POSIX — `bash.exe` on Windows
 * is a POSIX shell, and it is what actually gets launched.
 */
export function detectShellKind(
    shell: string,
    platform: NodeJS.Platform
): ShellKind {
    const base = shellBasename(shell);
    if (platform === "win32" && (base === "cmd.exe" || base === "cmd")) {
        return "cmd";
    }
    // pwsh[.exe] is PowerShell 6+, including PowerShell on macOS and Linux, so
    // it is deliberately not gated on win32.
    if (
        base === "powershell.exe" ||
        base === "powershell" ||
        base === "pwsh.exe" ||
        base === "pwsh"
    ) {
        return "powershell";
    }
    if (base === "") {
        // PowerShell has been the default Windows profile since VS Code 1.56.
        return platform === "win32" ? "powershell" : "posix";
    }
    return "posix";
}

/**
 * The shell path a pinned-`shellPath`-less terminal will actually be launched
 * with: `env.shell` when VS Code reports one, otherwise the configured default
 * profile's path, otherwise `ComSpec`.
 *
 * When `env.shell` is empty the callers pass `shellPath: undefined`, so VS Code
 * launches `terminal.integrated.defaultProfile` — which may well be cmd.exe or
 * Git Bash, not the PowerShell that a bare platform-default guess assumes. When
 * the guess and the launched shell disagree it is #1822 with the shells swapped:
 * the line fails to parse, so nothing runs — not even the trailing `exit` — and
 * a caller awaiting the terminal-close event hangs until the user closes the tab
 * by hand. Reading the configured profile makes the two agree by construction.
 *
 * Pure so the precedence can be tested without VS Code.
 */
export function effectiveShellPath(
    envShell: string,
    defaultProfileName: string | undefined,
    profiles: Record<string, TerminalProfileConfig | null> | undefined,
    comSpec: string | undefined
): string {
    if (envShell !== "") {
        return envShell;
    }
    const profile = defaultProfileName
        ? profiles?.[defaultProfileName]
        : undefined;
    const profilePath = Array.isArray(profile?.path)
        ? profile?.path[0]
        : profile?.path;
    return profilePath ?? comSpec ?? "";
}

/**
 * The shell kind of the integrated terminal. This is the only seam that reads
 * VS Code state; everything else takes a {@link ShellKind}, so callers should
 * resolve this once and thread the result through.
 *
 * `env.shell` is the empty string in environments that do not support a shell;
 * see {@link effectiveShellPath} for what is consulted instead.
 */
export function currentShellKind(): ShellKind {
    return detectShellKind(
        effectiveShellPath(
            env.shell ?? "",
            workspaceConfigs.terminalDefaultProfileName,
            workspaceConfigs.terminalProfiles,
            process.env.ComSpec
        ),
        process.platform
    );
}

/**
 * The shell kind of a terminal we did not create, classified from the
 * `shellPath` it was actually launched with rather than from `env.shell`.
 *
 * `env.shell` is only the *default* profile's path, so using it for a reused
 * terminal reintroduces #1822 with the shells swapped: a Windows user whose
 * default profile is Git Bash but whose focused tab is cmd.exe would get
 * POSIX single quotes, which cmd does not treat as quoting at all.
 *
 * `shellPath` is undefined when the terminal inherited the default profile
 * (which is what `env.shell` reports) and for extension-owned pseudoterminals,
 * which have no shell at all; both fall back to {@link currentShellKind}.
 *
 * `platform` is a parameter so the cmd.exe case is testable on any host OS.
 */
export function terminalShellKind(
    terminal: {creationOptions: Readonly<{shellPath?: string} | object>},
    platform: NodeJS.Platform = process.platform
): ShellKind {
    // ExtensionTerminalOptions (a pseudoterminal) has no shellPath at all, so
    // the property is read off the union rather than destructured.
    const shellPath =
        "shellPath" in terminal.creationOptions
            ? terminal.creationOptions.shellPath
            : undefined;
    return typeof shellPath !== "string" || shellPath === ""
        ? currentShellKind()
        : detectShellKind(shellPath, platform);
}

/**
 * The `args` of the configured default terminal profile whose path matches
 * `shell`, or undefined when there are none to forward.
 *
 * `env.shell` reports the default profile's *path* only, so pinning just the
 * path silently drops its args. VS Code does not fill them back in: passing an
 * explicit `executable` makes it build a fresh profile from
 * `{path, args: shellLaunchConfig.args}`, and `args` being undefined stays
 * undefined. A profile of `{path: "wsl.exe", args: ["-d", "Ubuntu-22.04"]}`
 * would therefore launch the *default* distro.
 *
 * Kept pure so the lookup can be tested without VS Code; the settings read
 * lives in {@link defaultProfileShellArgs}.
 */
export function resolveProfileShellArgs(
    shell: string,
    defaultProfileName: string | undefined,
    profiles: Record<string, TerminalProfileConfig | null> | undefined
): string[] | string | undefined {
    if (!defaultProfileName || !profiles) {
        return undefined;
    }
    const profile = profiles[defaultProfileName];
    if (!profile || profile.args === undefined) {
        return undefined;
    }
    // Only forward args we are sure belong to the shell we are pinning. A
    // renamed or `source`-based profile can point at a different executable
    // than env.shell reports, and passing another shell's args is worse than
    // passing none.
    const paths = Array.isArray(profile.path)
        ? profile.path
        : profile.path === undefined
          ? []
          : [profile.path];
    const matches = paths.some(
        (p) => p.toLowerCase() === shell.toLowerCase() || sameBasename(p, shell)
    );
    return matches ? profile.args : undefined;
}

function sameBasename(a: string, b: string): boolean {
    return shellBasename(a) !== "" && shellBasename(a) === shellBasename(b);
}

/**
 * The args of the user's configured default terminal profile, to pass alongside
 * `shellPath` when pinning a terminal's shell. See
 * {@link resolveProfileShellArgs} for why forwarding these matters.
 */
export function defaultProfileShellArgs(): string[] | string | undefined {
    return resolveProfileShellArgs(
        env.shell ?? "",
        workspaceConfigs.terminalDefaultProfileName,
        workspaceConfigs.terminalProfiles
    );
}

/** Command that clears the terminal scrollback. */
export function clearCmd(kind: ShellKind = currentShellKind()): string {
    switch (kind) {
        case "cmd":
            return "cls";
        case "powershell":
            return "Clear-Host";
        case "posix":
            return "clear";
    }
}

/**
 * Command that waits for the user before continuing, used to hold a terminal
 * open so a failing command's output stays readable.
 *
 * POSIX `read` needs a variable name: bare `read` is a syntax error in dash
 * ("read: arg count", exit 2), which would let the following `exit` close the
 * terminal immediately and discard the output we meant to keep. `read` waits for
 * a newline rather than a single keypress; `pause` and `Read-Host` differ, but
 * all three block until the user acts.
 */
export function readCmd(kind: ShellKind = currentShellKind()): string {
    switch (kind) {
        case "cmd":
            return "pause";
        case "powershell":
            return "Read-Host";
        case "posix":
            return "read _";
    }
}

/** Separator that chains commands unconditionally (cmd.exe has no `;`). */
export function commandSeparator(kind: ShellKind = currentShellKind()): string {
    switch (kind) {
        case "cmd":
            return " & ";
        case "powershell":
        case "posix":
            return "; ";
    }
}

/**
 * Quote a path so the shell treats it as a single argument. PowerShell needs the
 * call operator (`&`) in front of a quoted path, or it echoes the string instead
 * of executing it.
 */
export function escapeExecutableForTerminal(
    exe: string,
    kind: ShellKind = currentShellKind()
): string {
    const quoted = escapePathArgument(exe, kind);
    return kind === "powershell" ? `& ${quoted}` : quoted;
}

/**
 * Quote a path used as a command argument.
 *
 * Backslashes are never doubled: in cmd.exe and PowerShell `\` is a path
 * separator, not an escape character, so escaping it would corrupt Windows
 * paths. Each shell instead needs its own quoting:
 *
 * - PowerShell and POSIX both get *single* quotes, which are literal: they
 *   suppress `$` interpolation (and `$(...)`/backtick command substitution)
 *   rather than just the quote character. An embedded `'` is doubled in
 *   PowerShell; POSIX has no in-quote escape, so the quote is closed, escaped
 *   and reopened.
 * - cmd.exe has only double quotes and no escape at all, so an embedded `"` is
 *   doubled. Note this cannot protect `%VAR%`, which cmd expands inside double
 *   quotes — see {@link hasCmdUnsafeChars}.
 */
export function escapePathArgument(
    arg: string,
    kind: ShellKind = currentShellKind()
): string {
    switch (kind) {
        case "cmd":
            return `"${arg.replaceAll('"', '""')}"`;
        case "powershell":
            return `'${arg.replaceAll("'", "''")}'`;
        case "posix":
            return `'${arg.replaceAll("'", `'\\''`)}'`;
    }
}

/**
 * Whether `arg` contains a character cmd.exe expands even inside double quotes.
 *
 * cmd has no quoting that makes `%` literal in an interactive command line, so
 * a path such as `C:\p%TEMP%q` cannot be passed through faithfully. Callers that
 * must not silently corrupt a user-chosen path should check this and surface an
 * error rather than generating a command that does the wrong thing.
 *
 * `!` is included because under delayed expansion (`cmd /V:ON`, or
 * `DelayedExpansion` enabled in the registry — not the default, but present on
 * some corporate images) `!VAR!` also expands inside double quotes.
 */
export function hasCmdUnsafeChars(arg: string): boolean {
    return /[%!]/.test(arg);
}

/**
 * Render `message` as a command that prints it verbatim, escaping any character
 * the shell would otherwise interpret.
 *
 * Multi-line input is split into one print command per line: cmd.exe's `echo`
 * emits its arguments literally and has no escape for a newline, so a single
 * `echo` spanning lines would break the chain.
 */
export function echoCmd(
    message: string,
    kind: ShellKind = currentShellKind()
): string {
    return message
        .split(/\r?\n/)
        .map((line) => echoLine(line, kind))
        .join(commandSeparator(kind));
}

/**
 * One command printing `line` literally.
 *
 * POSIX uses `printf '%s\n'` rather than `echo`: zsh's and dash's builtin `echo`
 * interpret backslash escapes even inside single quotes, so a path containing
 * `\t` would print a tab and one containing `\c` would truncate the output. The
 * message is a printf *argument*, not the format string, so a literal `%` in it
 * is safe.
 *
 * cmd.exe is the awkward one: inside double quotes it prints the quotes
 * themselves, so metacharacters are escaped individually with `^` and left
 * unquoted. A blank line must be exactly `echo.` with no space — bare `echo`
 * prints the echo state instead, and `echo .` prints a dot.
 */
function echoLine(line: string, kind: ShellKind): string {
    if (kind === "powershell") {
        return `Write-Host ${escapePathArgument(line, kind)}`;
    }
    if (kind === "posix") {
        return `printf '%s\\n' ${escapePathArgument(line, kind)}`;
    }
    if (line === "") {
        return "echo.";
    }
    return `echo ${line.replaceAll(/[\^&|<>()"]/g, (char) => `^${char}`)}`;
}
