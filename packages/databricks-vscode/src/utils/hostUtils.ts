import {env} from "vscode";
import {ExecUtils, logging} from "@databricks/sdk-experimental";
import {cancellableExecFile} from "../cli/CliWrapper";
import {Loggers} from "../logger";

/**
 * Cursor identifies itself via env.uriScheme === "cursor",
 * everything else (VS Code, Insiders) uses vscode.
 */
export function isCursor(): boolean {
    return env.uriScheme === "cursor";
}

/**
 * The name of the host editor's shell command on PATH: `cursor` in Cursor,
 * `code` otherwise. This is the command the `databricks ssh connect` CLI shells
 * out to when opening the remote window, and it mirrors how the CLI resolves
 * `--ide` (see getSshConnectCommand): everything non-Cursor maps to `code`.
 *
 * VS Code Insiders ships its shell command as `code-insiders`, but the CLI has
 * no Insiders descriptor and always invokes `code`, so we deliberately probe
 * `code` there too — probing `code-insiders` would check a command the CLI
 * never calls. Real Insiders support belongs upstream in the CLI.
 */
export function getHostCliCommand(): "code" | "cursor" {
    return isCursor() ? "cursor" : "code";
}

/**
 * Whether the host editor's shell command (see getHostCliCommand) is definitely
 * missing from PATH. `databricks ssh connect` needs it to open the remote
 * window, so this lets us surface an actionable hint before spawning a terminal.
 *
 * This probe runs a non-interactive shell with the extension-host environment,
 * which does not source the user's profile the way the terminal that runs the
 * connect does, so it can differ from the terminal's PATH. Treat a `false` here
 * as advisory, not authoritative: only a definitive file-not-found reports
 * `false`; any other failure (permissions, a transient spawn error) is logged
 * and reported as `true` so we don't wrongly claim the command is missing.
 *
 * `exec` is injectable so the probe's branches can be tested.
 */
export async function isHostCliOnPath(
    exec: typeof cancellableExecFile = cancellableExecFile
): Promise<boolean> {
    try {
        await exec(getHostCliCommand(), ["--version"], {shell: true});
        return true;
    } catch (e) {
        if (ExecUtils.isFileNotFound(e)) {
            return false;
        }
        logging.NamedLogger.getOrCreate(Loggers.Extension).error(
            "Failed to probe the host CLI on PATH",
            e
        );
        return true;
    }
}
