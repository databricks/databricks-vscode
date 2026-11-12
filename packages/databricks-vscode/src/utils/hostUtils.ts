import {env, extensions} from "vscode";
import path from "path";
import {stat} from "fs/promises";
import {ExecUtils, logging} from "@databricks/sdk-experimental";
import {cancellableExecFile} from "../cli/CliWrapper";
import {Loggers} from "../logger";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";

/**
 * Cursor identifies itself via env.uriScheme === "cursor",
 * everything else (VS Code, Insiders) uses vscode.
 */
export function isCursor(): boolean {
    return env.uriScheme === "cursor";
}

/**
 * Whether the extension runs in a Databricks remote development session,
 * which sets these variables in the remote environment.
 */
export function isRemoteSshMode(): boolean {
    return (
        process.env["DATABRICKS_REMOTE_ENV"] === "1" &&
        Boolean(process.env["DATABRICKS_VIRTUAL_ENV"])
    );
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
 * The absolute path of the running editor's shell command (see
 * getHostCliCommand), or undefined if it can't be found. `databricks ssh
 * connect` runs it instead of looking the command up on PATH, where it is often
 * missing because users never ran "Install shell command" or skipped "Add to
 * PATH" at install.
 */
export async function getHostCliPath(
    appRoot: string = env.appRoot,
    platform: NodeJS.Platform = process.platform
): Promise<string | undefined> {
    const name = getHostCliCommand() + (platform === "win32" ? ".cmd" : "");
    // Relative to appRoot (<install>/resources/app, or
    // <app>.app/Contents/Resources/app on macOS):
    const candidates = [
        // bin/: VS Code and Cursor on macOS; Cursor on Windows, and on Linux in
        // some builds.
        path.join(appRoot, "bin", name),
        // ../../bin/: VS Code on Linux and Windows; Cursor on Linux in other
        // builds.
        path.join(appRoot, "..", "..", "bin", name),
        // ../../../bin/: VS Code on Windows builds with versioned updates,
        // which nest the app under <install>/<commit>/resources/app.
        path.join(appRoot, "..", "..", "..", "bin", name),
    ];
    for (const candidate of candidates) {
        if (await isFile(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

/**
 * The directory holding the `copilot` shim VS Code ships, mirroring where VS
 * Code's own Copilot integration looks for it: under `appRoot` on macOS, and
 * next to the editor executable elsewhere.
 */
export function getCopilotShimDir(
    appRoot: string = env.appRoot,
    execPath: string = process.execPath,
    platform: NodeJS.Platform = process.platform
): string {
    const p = platform === "win32" ? path.win32 : path.posix;
    return platform === "darwin"
        ? p.join(appRoot, "bin", "copilot-shim")
        : p.join(p.dirname(execPath), "bin", "copilot-shim");
}

/** The id of the extension that adds VS Code's `copilot` shim to terminals. */
const COPILOT_CHAT_EXTENSION_ID = "GitHub.copilot-chat";

/**
 * Whether VS Code puts its `copilot` shim on integrated terminals' PATH: the
 * Copilot Chat extension does, when it's enabled, AI features aren't turned off
 * and `chat.copilotCliCommand.enabled` isn't off.
 */
export function isCopilotShimOnTerminalPath(): boolean {
    return (
        workspaceConfigs.copilotCliCommandEnabled &&
        !workspaceConfigs.aiFeaturesDisabled &&
        extensions.getExtension(COPILOT_CHAT_EXTENSION_ID) !== undefined
    );
}

/**
 * `pathEnv` with VS Code's `copilot` shim directory appended when `enabled`,
 * matching the PATH an integrated terminal gets (appended, so a Copilot CLI
 * already on PATH wins). Child processes such as the Databricks CLI otherwise
 * inherit the extension host's PATH, which lacks the shim.
 */
export function withCopilotShimOnPath(
    pathEnv: string | undefined,
    shimDir: string = getCopilotShimDir(),
    enabled: boolean = isCopilotShimOnTerminalPath(),
    platform: NodeJS.Platform = process.platform
): string | undefined {
    if (!enabled) {
        return pathEnv;
    }
    const delimiter = platform === "win32" ? ";" : ":";
    const normalize = (d: string) =>
        platform === "win32" ? d.toLowerCase().replace(/\\+$/, "") : d;
    const dirs = (pathEnv ?? "").split(delimiter).filter((d) => d !== "");
    if (dirs.some((d) => normalize(d) === normalize(shimDir))) {
        return pathEnv;
    }
    return [...dirs, shimDir].join(delimiter);
}

async function isFile(filePath: string): Promise<boolean> {
    try {
        return (await stat(filePath)).isFile();
    } catch {
        return false;
    }
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
