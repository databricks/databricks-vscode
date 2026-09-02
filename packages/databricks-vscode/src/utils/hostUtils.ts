import {env, extensions} from "vscode";
import {ExecUtils, logging} from "@databricks/sdk-experimental";
import * as semver from "semver";
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

/** The subset of `shell-env`'s `shellEnv` we depend on. */
type ShellEnv = (shell?: string) => Promise<Readonly<Record<string, string>>>;

/**
 * Loads `shell-env` lazily. It is a pure-ESM module, so a static `import`
 * compiles to `require()` under our CommonJS target and would throw; a dynamic
 * `import()` (which Node 22+ honours for ESM without top-level await) loads it
 * in both the esbuild bundle and the tsc-compiled tests.
 */
async function defaultShellEnv(): Promise<ShellEnv> {
    return (await import("shell-env")).shellEnv;
}

/**
 * Whether the host editor's shell command (see getHostCliCommand) is definitely
 * missing from PATH. `databricks ssh connect` needs it to open the remote
 * window, so this lets us surface an actionable hint before spawning a terminal.
 *
 * The terminal that runs the connect sources the user's shell profile
 * (~/.zshrc, ~/.zprofile, …), but the extension host does not, so a `code` /
 * `cursor` that only lives on a profile-augmented PATH is invisible to a naive
 * probe. On POSIX we therefore resolve the login+interactive shell's env via
 * `shell-env` and hand that PATH to `execFile` so the probe sees what the
 * terminal will. On Windows there is no profile to source and the command is a
 * `.cmd` that needs a shell to launch, so we keep spawning through one.
 *
 * Because `execFile` resolves the executable against the PATH we pass (no
 * intervening shell on POSIX), a genuinely absent command yields a definitive
 * file-not-found and reports `false`. Any other failure — a slow or broken
 * profile, a spawn error — is advisory: it is logged and reported as `true` so
 * we don't wrongly claim the command is missing.
 *
 * `exec` and `loadShellEnv` are injectable so the probe's branches can be
 * tested without spawning a real login shell.
 */
export async function isHostCliOnPath(
    exec: typeof cancellableExecFile = cancellableExecFile,
    loadShellEnv: () => Promise<ShellEnv> = defaultShellEnv
): Promise<boolean> {
    const command = getHostCliCommand();
    try {
        if (process.platform === "win32") {
            await exec(command, ["--version"], {shell: true});
        } else {
            const shellEnv = await loadShellEnv();
            await exec(command, ["--version"], {env: await shellEnv()});
        }
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

/**
 * The Remote SSH extension `databricks ssh connect` opens the remote window
 * through, and the lowest version it accepts. Mirrors the CLI's IDE descriptors
 * the way getHostCliCommand mirrors its `--ide` handling: the CLI enforces this
 * id and floor itself, so a value that drifts from it passes here and then
 * fails in the terminal.
 */
export function getHostSshExtension(): {
    id: string;
    name: string;
    minVersion: string;
} {
    if (isCursor()) {
        return {
            id: "anysphere.remote-ssh",
            name: "Remote - SSH",
            minVersion: "1.0.32",
        };
    }
    return {
        id: "ms-vscode-remote.remote-ssh",
        name: "Remote - SSH",
        minVersion: "0.120.0",
    };
}

export type SshExtensionStatus =
    | {kind: "ok"}
    | {kind: "missing"}
    | {kind: "outdated"; installed: string};

/**
 * Whether the host's Remote SSH extension is installed at a version the tunnel
 * can use.
 *
 * The CLI answers the same question by shelling out to
 * `<command> --list-extensions`, which can fail for reasons that say nothing
 * about the extension. Reading the running editor's registry instead cannot.
 * Extensions disabled in this window are absent from it and so read as missing,
 * which is the right answer here: a disabled Remote SSH cannot open a window.
 */
export function getSshExtensionStatus(): SshExtensionStatus {
    const {id, minVersion} = getHostSshExtension();
    const installed = extensions.getExtension(id);
    if (installed === undefined) {
        return {kind: "missing"};
    }
    // Matches the CLI, which also treats an unparseable version as too old.
    const version = String(installed.packageJSON.version);
    if (semver.valid(version) !== null && semver.gte(version, minVersion)) {
        return {kind: "ok"};
    }
    return {kind: "outdated", installed: version};
}
