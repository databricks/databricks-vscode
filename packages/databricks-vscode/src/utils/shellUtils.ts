import path from "node:path";
import {env} from "vscode";

/**
 * The shell dialects we generate command lines for. This is about *syntax*, not
 * about the specific executable: WSL and Git Bash are both `"posix"` because
 * they parse the same way.
 */
export type ShellKind = "cmd" | "powershell" | "posix";

/**
 * Classify a shell executable path into the dialect its command lines must be
 * written in.
 *
 * Matching is on the **basename** (minus `.exe`), never a substring of the full
 * path: `C:\cmder\vendor\git-for-windows\bin\bash.exe` is bash, even though
 * "cmd" appears in its directory. `shell` and `platform` are parameters so this
 * stays a pure function, testable on any host OS.
 */
export function detectShellKind(
    shell: string,
    platform: NodeJS.Platform = process.platform
): ShellKind {
    if (shell === "") {
        // Shell-less environments. `env.shell` is always populated for this
        // (desktop-only) extension, so this is only defence in depth.
        return platform === "win32" ? "powershell" : "posix";
    }

    // `path.win32` splits on both separators, so this works regardless of the
    // host we're running on — `path.basename` on macOS would treat an entire
    // `C:\...\cmd.exe` as one segment.
    const name = path.win32
        .basename(shell)
        .toLowerCase()
        .replace(/\.exe$/, "");
    switch (name) {
        case "cmd":
            return "cmd";
        case "powershell":
        case "pwsh":
        case "pwsh-preview":
            return "powershell";
        default:
            // bash, zsh, fish, sh, dash, wsl, git-bash, ...
            return "posix";
    }
}

/**
 * The dialect of the shell that new terminals will run.
 *
 * `env.shell` is the resolved default terminal profile's path, so as long as we
 * create terminals without `shellPath` this names the shell that will actually
 * parse our command line. We deliberately don't pin `shellPath` to it: passing
 * an explicit executable makes VS Code drop the profile's `args`, which is what
 * makes login shells login shells on macOS.
 *
 * This is the only place `env.shell` is read, which keeps the rest of this
 * module unit testable.
 */
export function currentShellKind(): ShellKind {
    return detectShellKind(env.shell);
}

/** Clear the screen. */
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
 * Wait for the user to press a key, so a failed command stays readable instead
 * of the terminal closing on the following `exit`.
 *
 * POSIX uses `read _`: bare `read` is a usage error in dash (`read: arg count`),
 * which would fail the pause and let `exit` discard the error we're preserving.
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

/**
 * Separator for running commands in sequence. cmd has no `;`.
 *
 * No space before cmd's `&`: its `echo` prints the rest of the line raw, so
 * `echo one & echo two` would print "one" with a trailing space.
 */
export function commandSeparator(kind: ShellKind = currentShellKind()): string {
    return kind === "cmd" ? "& " : "; ";
}

/**
 * Quote a path used as a command *argument*.
 *
 * PowerShell and POSIX use single quotes because double quotes interpolate:
 * with `"..."` a directory named `C:\a$(whoami)b` would *execute* `whoami`, and
 * `C:\Users\me\$RECYCLE.BIN` would expand to `C:\Users\me\.BIN`.
 *
 * cmd has no literal quoting at all, so it keeps double quotes — and `%VAR%`
 * still expands inside them. Callers handing cmd a user-chosen path must reject
 * it first; see {@link hasCmdUnsafeChars}.
 */
export function escapePathArgument(
    arg: string,
    kind: ShellKind = currentShellKind()
): string {
    switch (kind) {
        case "cmd":
            return `"${arg.replaceAll('"', '""')}"`;
        case "powershell":
            // '' is the escape for a literal single quote in PowerShell.
            return `'${arg.replaceAll("'", "''")}'`;
        case "posix":
            // End the quote, emit an escaped quote, reopen: it's -> 'it'\''s'
            return `'${arg.replaceAll("'", "'\\''")}'`;
    }
}

/**
 * Quote a path being invoked as a command. PowerShell needs the `&` call
 * operator, because a quoted string on its own is just a string expression.
 */
export function escapeExecutableForTerminal(
    exe: string,
    kind: ShellKind = currentShellKind()
): string {
    const quoted = escapePathArgument(exe, kind);
    return kind === "powershell" ? `& ${quoted}` : quoted;
}

/**
 * Quote a path for a terminal whose shell we don't know.
 *
 * Only for reusing `window.activeTerminal`: it can be running any profile, so
 * neither `env.shell` nor a pinned `shellPath` tells us the dialect, and the
 * 1.86 API we build against has no `TerminalState.shell` to ask. Double quotes
 * are the compromise that at least parses in cmd, PowerShell and POSIX alike —
 * unlike single quotes, which cmd treats as literal characters.
 *
 * The trade-off is that double quotes interpolate: `$VAR` and `$(cmd)` are live
 * in POSIX and PowerShell. Prefer {@link escapePathArgument} with a known kind.
 * The real fix for such call sites is to skip the shell entirely and use a task
 * with an argv array.
 */
export function escapePathArgumentForUnknownShell(arg: string): string {
    return `"${arg.replaceAll('"', '\\"')}"`;
}

/** {@link escapePathArgumentForUnknownShell} for a path invoked as a command. */
export function escapeExecutableForUnknownShell(exe: string): string {
    const quoted = escapePathArgumentForUnknownShell(exe);
    return currentShellKind() === "powershell" ? `& ${quoted}` : quoted;
}

/**
 * Whether a string would be corrupted by cmd's variable expansion. `%VAR%`
 * expands even inside double quotes and there is no way to escape it on an
 * interactive command line, so callers must refuse rather than silently pass a
 * different value than the user chose.
 *
 * `!VAR!` is included because it expands the same way when delayed expansion is
 * enabled (`cmd /V:ON`, or via the registry — not the default, but some managed
 * Windows images turn it on).
 */
export function hasCmdUnsafeChars(arg: string): boolean {
    return /[%!]/.test(arg);
}

/**
 * Print one line verbatim.
 *
 * POSIX uses `printf '%s\n'` rather than `echo`: the `echo` builtin in zsh and
 * dash interprets backslash escapes *even inside single quotes*, so a path
 * containing `\t` would print a tab and `\c` would truncate the rest of the
 * line. The message is a printf *argument*, not the format string, so a literal
 * `%` in it is safe.
 *
 * Pass a single line — callers wanting a blank line should emit a separate
 * command, since `\n` handling differs per shell.
 */
export function echoLine(
    line: string,
    kind: ShellKind = currentShellKind()
): string {
    switch (kind) {
        case "cmd":
            // `echo.` prints an empty line; plain `echo` would print the ECHO
            // state instead.
            //
            // cmd's `echo` prints the rest of the line raw, so quoting it would
            // show the quotes. Escape the shell operators individually with `^`
            // instead — without this, a message containing `&`, `|` or `>` (our
            // banner embeds the user's output directory) is parsed as an
            // operator and cmd tries to run the following word as a command.
            // `%` cannot be escaped at all; callers pre-check with
            // {@link hasCmdUnsafeChars}.
            return line === "" ? "echo." : `echo ${escapeCmdEchoText(line)}`;
        case "powershell":
            return `Write-Host ${escapePathArgument(line, kind)}`;
        case "posix":
            return `printf '%s\\n' ${escapePathArgument(line, kind)}`;
    }
}

/**
 * Escape cmd's shell operators for use in `echo` text, so they print as
 * themselves instead of being parsed.
 *
 * Only operators *outside* double quotes are escaped. Inside quotes cmd already
 * treats them as text, and a `^` there would print literally — so escaping
 * blindly would corrupt the quoted path our banner embeds. A single regex pass
 * with an alternation keeps quoted runs intact: they match the first branch and
 * are emitted unchanged.
 */
function escapeCmdEchoText(text: string): string {
    return text.replace(/"[^"]*"?|[\^&|<>()]/g, (match) =>
        match.startsWith('"') ? match : `^${match}`
    );
}
