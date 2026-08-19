// Retry helper for the e2e test harness. Kept here (under `src/test/`, not
// `src/test/e2e/`) because `tsconfig.json` excludes the e2e folder from the
// unit build, so a colocated unit test only runs when the module lives outside
// it; the e2e specs import it via an explicit `.ts` extension.

export interface RetryOptions {
    // Total number of tries, including the first (so `attempts: 3` == 1 try + 2
    // retries).
    attempts: number;
    // Base delay; the wait before retry N is `delayMs * N` (linear backoff).
    delayMs: number;
    // Only failures this returns `true` for are retried; everything else
    // rethrows immediately so genuine breakage still surfaces fast.
    isTransient: (error: unknown) => boolean;
    // Called before each retry (not on the final give-up), for logging.
    onRetry?: (attempt: number, error: unknown) => void;
    // Injectable so tests run without real timers.
    sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

// Recognises the transient Windows file lock that makes a pip install fail even
// though a moment later it would succeed: another process (an AV scanner, an
// indexer, a still-running install) holding a file open, reported as WinError
// 32 "the process cannot access the file because it is being used by another
// process". We deliberately do NOT match WinError 5 "Access is denied", which
// is just as often a permanent permission failure — retrying that only delays
// the real error. Node's `execFile` surfaces only "Command failed: <cmd>" in
// `.message` and puts the real OSError in `.stderr`, so we search every stream
// the failure might carry its text in. `\b` keeps "WinError 32" from matching
// unrelated codes like "WinError 320".
export function isTransientFileLockError(error: unknown): boolean {
    const parts: string[] = [];
    if (error instanceof Error) {
        parts.push(error.message);
    }
    const streams = error as {stderr?: unknown; stdout?: unknown};
    if (typeof streams?.stderr === "string") {
        parts.push(streams.stderr);
    }
    if (typeof streams?.stdout === "string") {
        parts.push(streams.stdout);
    }
    return /being used by another process|WinError 32\b/i.test(
        parts.join("\n")
    );
}

// wdio `specFileRetries` count per platform. Windows-only: its e2e shards hit
// whole-session crashes no in-test wait can recover — a VS Code window reload
// can drop the wdio websocket ("Connection closed. Code: 1006"), so the rest of
// the spec cascades and only a fresh session (which a retry starts) recovers.
// Others stay at 0 so a real regression there isn't masked.
export function specFileRetriesForPlatform(platform: NodeJS.Platform): number {
    return platform === "win32" ? 1 : 0;
}

export async function retryOnTransientError<T>(
    operation: () => Promise<T>,
    options: RetryOptions
): Promise<T> {
    const sleep = options.sleep ?? defaultSleep;
    for (let attempt = 1; attempt < options.attempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (!options.isTransient(error)) {
                throw error;
            }
            options.onRetry?.(attempt, error);
            await sleep(options.delayMs * attempt);
        }
    }
    // Final attempt: nothing left to retry, so let success return or the error
    // propagate directly.
    return await operation();
}
