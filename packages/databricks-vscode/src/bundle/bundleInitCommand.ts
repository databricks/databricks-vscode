import {
    clearCmd,
    commandSeparator,
    echoCmd,
    escapePathArgument,
    hasCmdUnsafeChars,
    readCmd,
    ShellKind,
} from "../utils/shellUtils";

/**
 * Why `outputDir` cannot be passed through `kind` faithfully, or undefined when
 * it can.
 *
 * cmd.exe expands `%VAR%` — and `!VAR!` under delayed expansion — even inside
 * double quotes, and an interactive command line has no escape for either. The
 * CLI would scaffold into a directory the user never chose, after which
 * `getSubProjects` reports "we haven't detected any Databricks projects in …":
 * a silent wrong-directory, so callers must refuse rather than send.
 */
export function unsafeOutputDirReason(
    outputDir: string,
    kind: ShellKind
): string | undefined {
    if (kind === "cmd" && hasCmdUnsafeChars(outputDir)) {
        return (
            `The folder path "${outputDir}" contains a "%" or "!" character, which cmd.exe always expands ` +
            `as a variable, so the project would be created somewhere else. Choose a folder without those ` +
            `characters, or set terminal.integrated.defaultProfile.windows to PowerShell.`
        );
    }
    return undefined;
}

/**
 * The full `databricks bundle init` line sent to the wizard terminal: clear the
 * screen, explain what is running, run the CLI, then hold the terminal open
 * until the user acknowledges so any CLI error stays readable.
 *
 * Kept in its own module, free of `vscode` imports, so it stays a pure function
 * of (cli path, output dir, shell) and can be asserted for every shell family.
 * `escapedCliPath` is passed in because it is derived from CLI state.
 *
 * Throws when `outputDir` cannot be represented in `kind` — see
 * {@link unsafeOutputDirReason}. Callers should check that first and surface the
 * reason; the throw is a backstop so no path can reach a shell that would
 * silently rewrite it.
 */
export function buildBundleInitCommand(
    escapedCliPath: string,
    outputDir: string,
    kind: ShellKind
): string {
    const reason = unsafeOutputDirReason(outputDir, kind);
    if (reason !== undefined) {
        throw new Error(reason);
    }
    const args = [
        "bundle",
        "init",
        "--output-dir",
        escapePathArgument(outputDir, kind),
    ].join(" ");
    return [
        clearCmd(kind),
        echoCmd(
            `Executing: databricks ${args}\nFollow the steps below to create your new Databricks project.\n`,
            kind
        ),
        `${escapedCliPath} ${args}`,
        echoCmd("\nPress any key to close the terminal and continue ...", kind),
        readCmd(kind),
        "exit",
    ].join(commandSeparator(kind));
}
