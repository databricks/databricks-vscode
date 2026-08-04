import {env} from "vscode";

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
 * The shell kind of the integrated terminal. This is the only seam that reads
 * VS Code state; everything else takes a {@link ShellKind}, so callers should
 * resolve this once and thread the result through.
 *
 * `env.shell` is the empty string in environments that do not support a shell, in
 * which case the platform default is assumed — see {@link detectShellKind}.
 */
export function currentShellKind(): ShellKind {
    return detectShellKind(env.shell ?? "", process.platform);
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
 */
export function hasCmdUnsafeChars(arg: string): boolean {
    return arg.includes("%");
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
