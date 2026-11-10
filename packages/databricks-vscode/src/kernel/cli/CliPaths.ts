import { z } from "zod";
import { setting, type Settings } from "../../platform/settings";

/** INFRA-01: an override for the bundled CLI. The old name, machine-scoped. */
export const OVERRIDE_CLI_PATH = setting<string>("databricks", "overrideDatabricksCLIPath", "");

/**
 * The CLI that ships in the extension's `bin/`. The e2e harness's cleanup runs
 * this path, so it doesn't move. It keeps `.exe` on Windows:
 * the path is also passed to the Go SDK through `DATABRICKS_CLI_PATH`, and
 * it looks up the file literally.
 */
export function bundledCliPath(
    asAbsolutePath: (relative: string) => string,
    platform: NodeJS.Platform = process.platform,
): string {
    return asAbsolutePath(`./bin/${platform === "win32" ? "databricks.exe" : "databricks"}`);
}

/** The CLI every call uses: the override if set, else the bundled one. */
export function resolveCliPath(
    settings: Settings,
    asAbsolutePath: (relative: string) => string,
): string {
    return settings.get(OVERRIDE_CLI_PATH) || bundledCliPath(asAbsolutePath);
}

export interface CliVersion {
    /** For example "1.19.0". */
    readonly version: string;
    /** For example "v1.19.0". */
    readonly tag: string;
    readonly major: number;
    readonly minor: number;
    readonly patch: number;
}

const versionOutput = z.object({
    Version: z.string(),
    Tag: z.string(),
    Major: z.number(),
    Minor: z.number(),
    Patch: z.number(),
});

/** Parses `databricks version --output json`; undefined when it can't. */
export function parseCliVersion(stdout: string): CliVersion | undefined {
    let raw: unknown;
    try {
        raw = JSON.parse(stdout);
    } catch {
        return undefined;
    }
    const parsed = versionOutput.safeParse(raw);
    if (!parsed.success) {
        return undefined;
    }
    const { Version, Tag, Major, Minor, Patch } = parsed.data;
    return { version: Version, tag: Tag, major: Major, minor: Minor, patch: Patch };
}

/**
 * The warning for an overridden CLI older than the bundled one, or undefined.
 * Ported from `CliWrapper.warnOverridenCliDrift`.
 */
export function overriddenCliDriftWarning(
    override: CliVersion,
    bundledVersion: string | undefined,
): string | undefined {
    const parts = bundledVersion?.split(".").map(Number);
    if (parts === undefined || parts.length !== 3 || parts.some((p) => !Number.isFinite(p))) {
        return undefined;
    }
    const [major, minor, patch] = parts as [number, number, number];
    const newer =
        override.major > major ||
        (override.major === major && override.minor > minor) ||
        (override.major === major && override.minor === minor && override.patch >= patch);
    if (newer) {
        return undefined;
    }
    return `Your overridden Databricks CLI is out of date (${override.tag}). Please update to ${bundledVersion} or later, otherwise you may encounter errors with the Databricks extension.`;
}

/**
 * Development only: the warning for a bundled CLI that isn't the pinned
 * version, or undefined. A stale binary otherwise fails in opaque ways.
 * Ported from `CliWrapper.checkBundledCliVersionForDev`.
 */
export function bundledCliMismatchWarning(
    actual: string | undefined,
    pinned: string | undefined,
): string | undefined {
    if (actual === undefined || pinned === undefined || actual === pinned) {
        return undefined;
    }
    return (
        `The bundled Databricks CLI is v${actual}, but this checkout pins ` +
        `v${pinned}. Run "yarn workspace databricks fetch:cli" and reload the window.`
    );
}
