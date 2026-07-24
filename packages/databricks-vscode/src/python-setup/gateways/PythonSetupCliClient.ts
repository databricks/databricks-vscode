import {
    spawn as nodeSpawn,
    ChildProcessWithoutNullStreams,
} from "node:child_process";
import {StringDecoder} from "node:string_decoder";
import {
    buildSetupLocalArgs,
    SetupLocalInvocation,
} from "../utils/setupLocalArgs";
import {
    parsePythonSetupResult,
    PythonSetupResult,
} from "../models/PythonSetupResult";

/**
 * Minimal cancellation signal, structurally compatible with `vscode.Cancellation
 * Token`. Declared locally so this gateway carries no `vscode` import and stays
 * unit-testable without the extension host.
 */
export interface CancellationLike {
    readonly isCancellationRequested: boolean;
    onCancellationRequested(listener: () => void): {dispose(): void};
}

/**
 * Injectable spawn seam. The real implementation is Node's `child_process.
 * spawn`; tests pass a fake that emits scripted stdout/stderr.
 */
export type SpawnFn = (
    command: string,
    args: string[],
    options: {cwd: string; env: NodeJS.ProcessEnv; detached: boolean}
) => ChildProcessWithoutNullStreams;

/**
 * Injectable process-tree terminator. `setup-local` spawns `uv sync` as a
 * grandchild, and killing only the direct `databricks` child orphans it: on
 * Windows a plain `SIGTERM` doesn't even reach the CLI, and on POSIX a signal
 * to the direct child is not propagated to grandchildren. The default kills the
 * whole tree on both — `taskkill /T /F` on Windows, and (because the child is
 * spawned {@link https://nodejs.org/api/child_process.html detached}, i.e. its
 * own process-group leader) a `SIGTERM` to the negated pid on POSIX, which
 * signals the entire group. Injectable so cancellation is assertable in tests
 * without spawning real processes.
 */
export type TerminateFn = (child: ChildProcessWithoutNullStreams) => void;

/**
 * OS primitives used by {@link terminateProcessTree}, injectable so the
 * termination logic can be unit-tested without touching real processes.
 */
export interface TerminatePrimitives {
    platform: NodeJS.Platform;
    /** Send `signal` to `pid` (a negative pid targets the process group). */
    kill(pid: number, signal: NodeJS.Signals): void;
    /** Fire-and-forget helper spawn (e.g. `taskkill`). */
    spawnHelper(command: string, args: string[]): void;
}

const realTerminatePrimitives: TerminatePrimitives = {
    platform: process.platform,
    kill: (pid, signal) => process.kill(pid, signal),
    spawnHelper: (command, args) => {
        // Swallow the async spawn error (e.g. taskkill not on PATH) so it can't
        // become an uncaught exception in the extension host during cancel.
        nodeSpawn(command, args).on("error", () => {});
    },
};

/**
 * Kill the whole `setup-local` process tree, injectable primitives and all. On
 * Windows a plain `SIGTERM` doesn't reach the CLI, so force-kill the tree with
 * `taskkill /T /F`; on POSIX the child is a process-group leader (spawned
 * detached), so signalling the negated pid tears down the whole group —
 * including the `uv` grandchild a direct-child SIGTERM would orphan — with a
 * fallback to a direct kill if the group is already gone.
 */
export function terminateProcessTree(
    child: ChildProcessWithoutNullStreams,
    prims: TerminatePrimitives = realTerminatePrimitives
): void {
    const pid = child.pid;
    if (prims.platform === "win32") {
        if (pid) {
            prims.spawnHelper("taskkill", ["/pid", String(pid), "/T", "/F"]);
            return;
        }
    } else if (pid) {
        try {
            prims.kill(-pid, "SIGTERM");
            return;
        } catch {
            // Group already gone / not a leader — fall through to a direct kill.
        }
    }
    child.kill("SIGTERM");
}

const defaultTerminate: TerminateFn = (child) => terminateProcessTree(child);

/**
 * Rejection raised when a {@link PythonSetupCliClient.run} is aborted via its
 * cancellation token, so callers can distinguish a user cancellation from a
 * genuine CLI failure (which surfaces as a `PythonSetupParseError` or the
 * spawn error).
 */
export class PythonSetupCancelledError extends Error {
    constructor() {
        super("Python setup was cancelled");
        this.name = "PythonSetupCancelledError";
    }
}

export interface RunOptions {
    /** Working directory the CLI runs in (the project root). */
    cwd: string;
    /** Receives raw stderr chunks for the output/"Show Logs" channel. */
    onLog?: (chunk: string) => void;
    /** When cancelled, the child process is terminated. */
    token?: CancellationLike;
}

/**
 * Gateway to the `databricks environments setup-local` CLI command.
 *
 * Runs the CLI with `--output json`, captures stdout (the single structured
 * {@link PythonSetupResult}) and stderr (raw logs), and resolves with the parsed
 * result on both success and failure exits — the caller branches on `result.ok`
 * / `result.error`, not on the process exit code. A cancelled run rejects with
 * {@link PythonSetupCancelledError} so callers can tell it apart from a genuine
 * CLI failure.
 *
 * There is deliberately no live phase narration: under `--output json` the CLI
 * emits only the final JSON object on stdout (per-phase text is text-mode only,
 * and `uv sync` output is buffered), so callers show an indeterminate progress
 * indicator and read the per-phase outcomes from `result.phases` afterwards.
 *
 * The client itself does no I/O beyond spawning: path resolution and argv are
 * pure helpers, and the spawn function is injected, so it is fully unit-testable.
 */
export class PythonSetupCliClient {
    constructor(
        private readonly resolvePath: () => string,
        private readonly spawnFn: SpawnFn = nodeSpawn as unknown as SpawnFn,
        private readonly terminateFn: TerminateFn = defaultTerminate
    ) {}

    run(
        invocation: SetupLocalInvocation,
        options: RunOptions
    ): Promise<PythonSetupResult> {
        // `setup-local` mutates the project (.venv / pyproject.toml), so if the
        // request is already cancelled don't even start it — reject before
        // spawning rather than spawn-then-kill, which would let it run briefly.
        if (options.token?.isCancellationRequested) {
            return Promise.reject(new PythonSetupCancelledError());
        }
        const args = buildSetupLocalArgs(invocation);
        return new Promise<PythonSetupResult>((resolve, reject) => {
            let child: ChildProcessWithoutNullStreams;
            try {
                child = this.spawnFn(this.resolvePath(), args, {
                    cwd: options.cwd,
                    env: process.env,
                    // Give the child its own process group on POSIX so cancel
                    // can kill the whole tree (see defaultTerminate). On Windows
                    // `detached` opens a new console; we use taskkill there, so
                    // leave it off.
                    detached: process.platform !== "win32",
                });
            } catch (e) {
                reject(e as Error);
                return;
            }

            // Accumulate raw bytes and decode once at the end: a multi-byte
            // UTF-8 sequence can straddle two "data" chunks, and decoding each
            // chunk in isolation would corrupt it (turning a valid JSON payload
            // into U+FFFD garbage that fails to parse). stderr is streamed to
            // onLog as it arrives, so it goes through a StringDecoder that holds
            // back any trailing partial code point until the next chunk.
            const stdoutChunks: Buffer[] = [];
            const stderrDecoder = new StringDecoder("utf8");
            let stderr = "";
            let settled = false;
            let cancelled = false;

            const requestCancel = () => {
                cancelled = true;
                // Best-effort terminate; the "close"/"error" handler still
                // fires and settles the promise, so cancellation never leaves
                // it hanging. Guard against terminate throwing (e.g. the child
                // is already gone) so it can't escape this callback.
                try {
                    this.terminateFn(child);
                } catch {
                    // ignore — the process-exit handler will settle the promise
                }
            };

            const cancelSub =
                options.token?.onCancellationRequested(requestCancel);

            const finish = (fn: () => void) => {
                if (settled) {
                    return;
                }
                settled = true;
                cancelSub?.dispose();
                fn();
            };

            child.stdout.on("data", (b: Buffer) => stdoutChunks.push(b));
            child.stderr.on("data", (b: Buffer) => {
                const text = stderrDecoder.write(b);
                if (text) {
                    stderr += text;
                    options.onLog?.(text);
                }
            });

            // A stream-level error (e.g. EPIPE) would otherwise be an unhandled
            // "error" event, which Node throws as an uncaught exception in the
            // extension host. Route it through finish() like any other failure.
            child.stdout.on("error", (err: Error) => finish(() => reject(err)));
            child.stderr.on("error", (err: Error) => finish(() => reject(err)));

            child.on("error", (err: Error) => finish(() => reject(err)));

            child.on("close", () =>
                finish(() => {
                    // Flush any partial trailing byte the decoder held back, and
                    // forward it to onLog too so the log channel isn't missing
                    // the final fragment.
                    const tail = stderrDecoder.end();
                    if (tail) {
                        stderr += tail;
                        options.onLog?.(tail);
                    }
                    if (cancelled) {
                        reject(new PythonSetupCancelledError());
                        return;
                    }
                    const stdout = Buffer.concat(stdoutChunks).toString("utf8");
                    try {
                        resolve(parsePythonSetupResult(stdout));
                    } catch (e) {
                        // No parseable result on stdout. Append captured stderr
                        // (uv/CLI diagnostics, or an auth error printed before a
                        // result object was built) so the failure is actionable,
                        // while preserving the original error's type.
                        const err = e as Error;
                        const detail = stderr.trim();
                        if (detail) {
                            err.message = `${err.message}\n${detail}`;
                        }
                        reject(err);
                    }
                })
            );
        });
    }
}
