import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { ProcessRunner } from "../../platform/process";
import { setting, type Settings } from "../../platform/settings";

const COPILOT_BINARY = "copilot";

/** The Copilot Chat setting that adds the shim to terminals. Unset means on. */
const COPILOT_CLI_COMMAND_ENABLED = setting<boolean>("chat", "copilotCliCommand.enabled", true);
/** Turns off Copilot, and with it the shim. */
const DISABLE_AI_FEATURES = setting<boolean>("chat", "disableAIFeatures", false);

/**
 * Whether GitHub Copilot CLI is usable through the `copilot` on PATH. `{shim}`
 * means `copilot` is only VS Code's shim, which installs the CLI when run in a
 * terminal.
 */
export type CopilotCliStatus = "installed" | "missing" | { readonly shim: string };

/**
 * The directory of the `copilot` shim VS Code ships, where its own Copilot
 * integration looks for it: under `appRoot` on macOS, next to the editor
 * executable elsewhere.
 */
export function copilotShimDir(
    appRoot: string,
    execPath: string,
    platform: NodeJS.Platform = process.platform,
): string {
    const p = platformPath(platform);
    return platform === "darwin"
        ? p.join(appRoot, "bin", "copilot-shim")
        : p.join(p.dirname(execPath), "bin", "copilot-shim");
}

/**
 * Whether VS Code puts the shim on integrated terminals' PATH: its Copilot
 * integration does, when Copilot Chat is installed, the CLI command is enabled
 * and AI features aren't turned off.
 */
export function shimOnTerminalPath(settings: Settings, copilotChatInstalled: boolean): boolean {
    return (
        settings.get(COPILOT_CLI_COMMAND_ENABLED) &&
        !settings.get(DISABLE_AI_FEATURES) &&
        copilotChatInstalled
    );
}

/**
 * Whether `binary` is a VS Code Copilot shim. Every VS Code build ships it as
 * `bin/copilot-shim/copilot[.exe]`, and Linux packages link it from
 * `/usr/bin`, so this also matches another editor's shim inherited on PATH.
 */
export async function isCopilotShim(
    binary: string,
    platform: NodeJS.Platform = process.platform,
    resolve: (p: string) => Promise<string> = realpath,
): Promise<boolean> {
    const p = platformPath(platform);
    const resolved = await resolve(binary).catch(() => binary);
    const dir = p.dirname(resolved);
    const same = (a: string, b: string) =>
        platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
    return same(p.basename(dir), "copilot-shim") && same(p.basename(p.dirname(dir)), "bin");
}

/**
 * `pathEnv` with `shimDir` appended, as an integrated terminal gets it: the
 * shim comes last, so a Copilot CLI already on PATH wins. Unchanged when the
 * directory is already there.
 */
export function pathWithShimDir(
    pathEnv: string | undefined,
    shimDir: string,
    platform: NodeJS.Platform = process.platform,
): string {
    const delimiter = platformPath(platform).delimiter;
    const normalize = (d: string) =>
        platform === "win32" ? d.toLowerCase().replace(/\\+$/, "") : d;
    const dirs = (pathEnv ?? "").split(delimiter).filter((d) => d !== "");
    if (dirs.some((d) => normalize(d) === normalize(shimDir))) {
        return pathEnv ?? "";
    }
    return [...dirs, shimDir].join(delimiter);
}

/**
 * `env` with the shim directory on its PATH. Windows names the variable with
 * any case, and a second spelling would be a second variable to the child.
 */
export function withShimOnPath(
    env: Readonly<Record<string, string>>,
    shimDir: string,
    platform: NodeJS.Platform = process.platform,
): Record<string, string> {
    const key = envKey(env, "PATH", platform);
    return { ...env, [key]: pathWithShimDir(env[key], shimDir, platform) };
}

export interface CopilotCliCheck {
    /** The environment `copilot` would run in: the PATH aitools calls get. */
    readonly env: Readonly<Record<string, string | undefined>>;
    /** Whether the shim at this path can run GitHub Copilot CLI's own check. */
    readonly probe: (binary: string) => Promise<boolean>;
    readonly platform?: NodeJS.Platform;
}

/**
 * Checks `copilot` on `env.PATH` the way the Databricks CLI will run it. A
 * shim only counts as installed when the probe passes: it forwards to a Copilot
 * CLI it can find off PATH, e.g. one it has just installed.
 */
export async function getCopilotCliStatus({
    env,
    probe,
    platform = process.platform,
}: CopilotCliCheck): Promise<CopilotCliStatus> {
    const binary = await findOnPath(env, COPILOT_BINARY, platform);
    if (binary === null) {
        return "missing";
    }
    if (!(await isCopilotShim(binary, platform)) || (await probe(binary))) {
        return "installed";
    }
    return { shim: binary };
}

/** Upper bound on the probe. It only prints help, so this guards against a hang. */
const PROBE_TIMEOUT_MS = 30_000;

/** Whether `copilot plugin --help`, the CLI's own check, succeeds through `binary`. */
export async function probeCopilotCli(
    processes: ProcessRunner,
    binary: string,
    env: Readonly<Record<string, string>>,
): Promise<boolean> {
    try {
        const result = await processes.run(binary, ["plugin", "--help"], {
            env,
            // Without a terminal the shim doesn't prompt: with no Copilot CLI to forward to, it exits non-zero.
            closeStdin: true,
            signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        return result.exitCode === 0 && !result.cancelled;
    } catch {
        return false;
    }
}

/** The first executable `binary` on `env`'s PATH, with PATHEXT's extensions on Windows. */
async function findOnPath(
    env: Readonly<Record<string, string | undefined>>,
    binary: string,
    platform: NodeJS.Platform,
): Promise<string | null> {
    const p = platformPath(platform);
    const dirs = (env[envKey(env, "PATH", platform)] ?? "")
        .split(p.delimiter)
        .filter((d) => d !== "");
    const extensions =
        platform === "win32"
            ? (env[envKey(env, "PATHEXT", platform)] ?? ".COM;.EXE;.BAT;.CMD")
                  .split(";")
                  .filter((e) => e !== "")
            : [""];
    for (const dir of dirs) {
        for (const extension of extensions) {
            const candidate = p.join(dir, binary + extension);
            if (await isExecutableFile(candidate, platform)) {
                return candidate;
            }
        }
    }
    return null;
}

async function isExecutableFile(file: string, platform: NodeJS.Platform): Promise<boolean> {
    try {
        if (!(await stat(file)).isFile()) {
            return false;
        }
        if (platform !== "win32") {
            await access(file, constants.X_OK);
        }
        return true;
    } catch {
        return false;
    }
}

/** The name `env` has the variable under: Windows matches it without regard to case. */
function envKey(
    env: Readonly<Record<string, string | undefined>>,
    name: string,
    platform: NodeJS.Platform,
): string {
    return platform === "win32"
        ? (Object.keys(env).find((k) => k.toUpperCase() === name) ?? name)
        : name;
}

function platformPath(platform: NodeJS.Platform): typeof path.posix {
    return platform === "win32" ? path.win32 : path.posix;
}
