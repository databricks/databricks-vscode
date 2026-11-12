import {realpath} from "fs/promises";
import path from "path";
import which from "which";
import {CancellationTokenSource} from "vscode";
import {cancellableExecFile} from "../cli/CliWrapper";

const COPILOT_BINARY = "copilot";

/** Upper bound on the probe; it only prints help, so this only guards a hang. */
const PROBE_TIMEOUT_MS = 30_000;

/**
 * Whether GitHub Copilot CLI is usable through the `copilot` on PATH. `{shim}`
 * means `copilot` is only VS Code's shim, which installs the CLI when run in a
 * terminal.
 */
export type CopilotCliStatus = "installed" | "missing" | {shim: string};

/**
 * Whether `binary` is a VS Code Copilot shim. Every VS Code build ships it as
 * `bin/copilot-shim/copilot[.exe]` in its install, which Linux packages link
 * from `/usr/bin`, so this also matches another editor's shim inherited on PATH.
 */
export async function isCopilotShim(
    binary: string,
    platform: NodeJS.Platform = process.platform,
    resolve: (p: string) => Promise<string> = realpath
): Promise<boolean> {
    const p = platform === "win32" ? path.win32 : path.posix;
    const resolved = await resolve(binary).catch(() => binary);
    const dir = p.dirname(resolved);
    const same = (a: string, b: string) =>
        platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
    return (
        same(p.basename(dir), "copilot-shim") &&
        same(p.basename(p.dirname(dir)), "bin")
    );
}

/** Whether `copilot plugin --help`, the CLI's own check, succeeds. */
async function probeCopilot(
    binary: string,
    env: NodeJS.ProcessEnv
): Promise<boolean> {
    const timeout = new CancellationTokenSource();
    const timer = setTimeout(() => timeout.cancel(), PROBE_TIMEOUT_MS);
    try {
        // Without a terminal the shim doesn't prompt: with no Copilot CLI to
        // forward to, it exits non-zero.
        await cancellableExecFile(
            binary,
            ["plugin", "--help"],
            {env},
            timeout.token,
            {closeStdin: true}
        );
        return true;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
        timeout.dispose();
    }
}

/**
 * Check `copilot` on `env.PATH` the way the Databricks CLI will run it. A shim
 * only counts as installed when the probe passes: it forwards to a Copilot CLI
 * it can find off PATH, e.g. one it just installed.
 */
export async function getCopilotCliStatus(
    env: NodeJS.ProcessEnv,
    {
        platform = process.platform,
        lookup = (pathEnv) =>
            which(COPILOT_BINARY, {path: pathEnv, nothrow: true}),
        isShim = (binary) => isCopilotShim(binary, platform),
        probe = probeCopilot,
    }: {
        platform?: NodeJS.Platform;
        lookup?: (pathEnv: string | undefined) => Promise<string | null>;
        isShim?: (binary: string) => Promise<boolean>;
        probe?: (binary: string, env: NodeJS.ProcessEnv) => Promise<boolean>;
    } = {}
): Promise<CopilotCliStatus> {
    const binary = await lookup(env.PATH);
    if (binary === null) {
        return "missing";
    }
    if (!(await isShim(binary)) || (await probe(binary, env))) {
        return "installed";
    }
    return {shim: binary};
}
