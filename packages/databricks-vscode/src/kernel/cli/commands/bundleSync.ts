import { z } from "zod";
import type { ProcessHandle } from "../../../platform/process";
import type { Cli, CliStartContext } from "../Cli";

/*
 * `bundle sync --watch --output json` (SYNC-01), a long-running process. It
 * prints one JSON event per line on stdout and its errors on stderr. The
 * process seam delivers whole lines, so an event split across two chunks is
 * parsed once it is complete; the old parser split each chunk on its own
 * and dropped both halves. Ported from the old
 * `DatabricksCliSyncParser` and `CliWrapper.getSyncCommand`.
 */

const changes = {
    put: z.array(z.string()).optional(),
    delete: z.array(z.string()).optional(),
};

const syncEvent = z.discriminatedUnion("type", [
    z.looseObject({ type: z.literal("start"), ...changes }),
    z.looseObject({
        type: z.literal("progress"),
        action: z.enum(["put", "delete"]),
        path: z.string(),
        progress: z.number(),
    }),
    z.looseObject({ type: z.literal("complete"), ...changes }),
]);

/** A synchronization started, uploaded or deleted a file, or completed. */
export type SyncEvent = z.infer<typeof syncEvent>;

/** `--full` uploads every file again, instead of only the changes since the last sync. */
export function syncArgs(target: string, options: { full?: boolean } = {}): string[] {
    return [
        "bundle",
        "sync",
        "--target",
        target,
        "--watch",
        "--output",
        "json",
        ...(options.full ? ["--full"] : []),
    ];
}

/** One stdout line as an event; undefined for a blank line, a line that isn't JSON, or an unknown event. */
export function parseSyncEvent(line: string): SyncEvent | undefined {
    const trimmed = line.trim();
    if (trimmed === "") {
        return undefined;
    }
    let raw: unknown;
    try {
        raw = JSON.parse(trimmed);
    } catch {
        return undefined;
    }
    const parsed = syncEvent.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
}

/** What an error line reports. The Files in Repos case comes from Repos-era workspaces. */
export type SyncError =
    | { readonly kind: "filesInWorkspaceDisabled" }
    | { readonly kind: "filesInReposDisabled" }
    | { readonly kind: "error"; readonly reason: string };

/** An `Error: …` line, from stderr or stdout, as the old parser matched it. */
export function parseSyncError(line: string): SyncError | undefined {
    const trimmed = line.trim();
    if (/^Error: .*Files in Workspace is disabled.*/.test(trimmed)) {
        return { kind: "filesInWorkspaceDisabled" };
    }
    if (/^Error: .*Files in Repos is disabled.*/.test(trimmed)) {
        return { kind: "filesInReposDisabled" };
    }
    const match = /^Error: (.*)/.exec(trimmed);
    return match === null ? undefined : { kind: "error", reason: match[1]! };
}

/**
 * Starts `bundle sync --watch` for the target, in the bundle's root. It runs
 * until it fails or is killed; `exited` says which.
 */
export function bundleSync(
    cli: Cli,
    target: string,
    ctx: CliStartContext,
    options: { full?: boolean } = {},
): ProcessHandle {
    return cli.start(syncArgs(target, options), ctx);
}
