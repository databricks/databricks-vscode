import {env} from "vscode";
import {cancellableExecFile} from "../cli/CliWrapper";

/**
 * Cursor identifies itself via env.uriScheme === "cursor",
 * everything else (VS Code, Insiders) uses vscode.
 */
export function isCursor(): boolean {
    return env.uriScheme === "cursor";
}

/**
 * The name of the host editor's shell command on PATH: `cursor` in Cursor,
 * `code` in VS Code. This is the command the `databricks ssh connect` CLI
 * shells out to when opening the remote window (see the CLI's ideDescriptor),
 * and is distinct from the `--ide=vscode|cursor` value passed to that command.
 */
export function getHostCliCommand(): "code" | "cursor" {
    return isCursor() ? "cursor" : "code";
}

/**
 * Whether the host editor's shell command (see getHostCliCommand) is available
 * on PATH. `databricks ssh connect` needs it to open the remote window, so this
 * lets us fail fast with an actionable prompt before spawning a terminal.
 * Runs through a shell so PATH is resolved the same way the terminal would.
 */
export async function isHostCliOnPath(): Promise<boolean> {
    try {
        await cancellableExecFile(getHostCliCommand(), ["--version"], {
            shell: true,
        });
        return true;
    } catch {
        return false;
    }
}
