import { UserFacingError } from "../../../platform/errors";
import {
    commandSeparator,
    echoLine,
    escapeExecutableForTerminal,
    escapePathArgument,
    hasCmdUnsafeChars,
    readCmd,
    runLineArgs,
    type ShellKind,
} from "../../../platform/shell";

/**
 * `databricks bundle init` runs the CLI's interactive template wizard, so it
 * runs in a terminal the user types into, not through `Cli.exec`. This
 * module builds that terminal's command line and environment; the
 * new-project wizard (`features/bundle-init`) creates the terminal.
 */

function bundleInitArgs(outputDir: string): string[] {
    return ["bundle", "init", "--output-dir", outputDir];
}

/**
 * The line the terminal's shell runs, in that shell's dialect: a banner, the
 * wizard, then a prompt to press a key. The line ends, so does the shell, and
 * the terminal closes and lets the extension carry on. Ported from the old
 * `BundleInitWizard.bundleInitInTerminal`, which typed it, `clear` and `exit`
 * at the user's prompt.
 *
 * cmd expands `%VAR%` (and `!VAR!` under delayed expansion) even inside
 * double quotes, and offers no way to escape it. Rather than scaffold the
 * project into a folder the user didn't choose, this refuses.
 */
export function bundleInitCommandLine(cliPath: string, outputDir: string, kind: ShellKind): string {
    if (kind === "cmd" && hasCmdUnsafeChars(outputDir)) {
        throw new UserFacingError(
            "UNSAFE_OUTPUT_DIR",
            `Can't create a project in "${outputDir}": the Command Prompt shell ` +
                `expands "%" and "!" in paths. Choose a folder without those characters, or ` +
                `set "terminal.integrated.defaultProfile.windows" to PowerShell.`,
        );
    }
    const args = bundleInitArgs(escapePathArgument(outputDir, kind)).join(" ");
    return [
        echoLine(`Executing: databricks ${args}`, kind),
        echoLine("Follow the steps below to create your new Databricks project.", kind),
        echoLine("", kind),
        `${escapeExecutableForTerminal(cliPath, kind)} ${args}`,
        echoLine("", kind),
        echoLine("Press any key to close the terminal and continue ...", kind),
        readCmd(kind),
    ].join(commandSeparator(kind));
}

/**
 * The terminal's shell arguments: the shell runs the line itself rather than
 * have it typed at its prompt, which would echo it above the wizard.
 */
export function bundleInitShellArgs(
    cliPath: string,
    outputDir: string,
    kind: ShellKind,
): string[] | string {
    return runLineArgs(bundleInitCommandLine(cliPath, outputDir, kind), kind);
}

/**
 * The terminal's environment: `childEnv` for the chosen profile, with text
 * output, because the wizard is read by a person.
 */
export function bundleInitEnv(childEnv: Record<string, string>): Record<string, string> {
    return { ...childEnv, DATABRICKS_OUTPUT_FORMAT: "text" };
}
