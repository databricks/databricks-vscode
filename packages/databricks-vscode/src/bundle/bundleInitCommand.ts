import {
    clearCmd,
    commandSeparator,
    echoCmd,
    escapePathArgument,
    readCmd,
    ShellKind,
} from "../utils/shellUtils";

/**
 * The full `databricks bundle init` line sent to the wizard terminal: clear the
 * screen, explain what is running, run the CLI, then hold the terminal open
 * until the user acknowledges so any CLI error stays readable.
 *
 * Kept in its own module, free of `vscode` imports, so it stays a pure function
 * of (cli path, output dir, shell) and can be asserted for every shell family.
 * `escapedCliPath` is passed in because it is derived from CLI state.
 */
export function buildBundleInitCommand(
    escapedCliPath: string,
    outputDir: string,
    kind: ShellKind
): string {
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
