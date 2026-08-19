import {env} from "vscode";
import {logging} from "@databricks/sdk-experimental";
import {isFileNotFound} from "@databricks/sdk-experimental/dist/config/execUtils";
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
 * `code-insiders` in VS Code Insiders, `code` in stable VS Code. This is the
 * command the `databricks ssh connect` CLI shells out to when opening the remote
 * window (see the CLI's ideDescriptor), and is distinct from the
 * `--ide=vscode|cursor` value passed to that command.
 */
export function getHostCliCommand(): "code" | "code-insiders" | "cursor" {
    if (isCursor()) {
        return "cursor";
    }
    // Insiders ships its shell command as `code-insiders`, not `code`; an
    // Insiders-only install has that on PATH.
    if (env.uriScheme === "vscode-insiders") {
        return "code-insiders";
    }
    return "code";
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
        if (isFileNotFound(e)) {
            return false;
        }
        logging.NamedLogger.getOrCreate(Loggers.Extension).error(
            "Failed to probe the host CLI on PATH",
            e
        );
        return true;
    }
}
