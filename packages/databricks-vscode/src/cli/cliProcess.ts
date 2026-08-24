import {
    spawn as nodeSpawn,
    ChildProcessWithoutNullStreams,
} from "node:child_process";
import {StringDecoder} from "node:string_decoder";

/**
 * Minimal cancellation signal, structurally compatible with `vscode.Cancellation
 * Token`. Declared locally so this module carries no `vscode` import and stays
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
    options: {
        cwd?: string;
        env?: NodeJS.ProcessEnv;
        detached?: boolean;
        shell?: boolean;
        windowsVerbatimArguments?: boolean;
    }
) => ChildProcessWithoutNullStreams;

/**
 * Injectable process-tree terminator. The default kills the whole tree on both
 * platforms (see {@link terminateProcessTree}). Injectable so cancellation is
 * assertable in tests without spawning real processes.
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
 * Kill the whole process tree, injectable primitives and all. On Windows a
 * plain `SIGTERM` doesn't reach a CLI spawned via `cmd.exe`, so force-kill the
 * tree with `taskkill /T /F` (always forceful — `signal` is moot there); on
 * POSIX the child is a process-group leader (spawned detached), so signalling
 * the negated pid tears down the whole group — including any grandchild a
 * direct-child signal would orphan (e.g. `terraform`, `uv`) — with a fallback
 * to a direct kill if the group is already gone.
 */
export function terminateProcessTree(
    child: ChildProcessWithoutNullStreams,
    prims: TerminatePrimitives = realTerminatePrimitives,
    signal: NodeJS.Signals = "SIGTERM"
): void {
    const pid = child.pid;
    if (prims.platform === "win32") {
        if (pid) {
            prims.spawnHelper("taskkill", ["/pid", String(pid), "/T", "/F"]);
            return;
        }
    } else if (pid) {
        try {
            prims.kill(-pid, signal);
            return;
        } catch {
            // Group already gone / not a leader — fall through to a direct kill.
        }
    }
    child.kill(signal);
}

/** Graceful terminate (SIGTERM) — the first attempt on cancellation. */
const defaultTerminate: TerminateFn = (child) => terminateProcessTree(child);

/** Forceful terminate (SIGKILL) — the escalation when the graceful one is ignored. */
const defaultForceTerminate: TerminateFn = (child) =>
    terminateProcessTree(child, realTerminatePrimitives, "SIGKILL");

/**
 * How long to wait after the graceful `SIGTERM` before escalating to `SIGKILL`
 * on cancellation. Bounds how long a cancel can take when a child ignores the
 * first signal, so the run always settles.
 */
const DEFAULT_KILL_GRACE_MS = 5000;

/**
 * Escape a command for a shell we hand it to. On Windows we route through
 * `cmd.exe` (`/d` disables AutoRun, `/c` runs then exits) with the whole
 * command as one double-quoted string plus `windowsVerbatimArguments`, so a
 * path or argument containing spaces survives Node's own arg-quoting. On POSIX
 * the command is passed through unchanged.
 *
 * `platform` is injectable so both branches are unit-testable on one host.
 */
export function getEscapedCommandAndArgs(
    command: string,
    args: string[],
    platform: NodeJS.Platform = process.platform
): {cmd: string; args: string[]; windowsVerbatimArguments?: boolean} {
    if (platform === "win32") {
        return {
            cmd: "cmd.exe",
            args: [
                "/d",
                "/c",
                `""${command}" ${args.map((a) => `"${a}"`).join(" ")}"`,
            ],
            windowsVerbatimArguments: true,
        };
    }
    return {cmd: command, args};
}

export interface CliRunResult {
    /** Full stdout, decoded once at the end (never corrupts a split code point). */
    stdout: string;
    /** Full stderr, decoded once at the end. */
    stderr: string;
    /** Process exit code, or `null` when the process was killed by a signal. */
    exitCode: number | null;
    /** True when the run was aborted via its cancellation token. */
    cancelled: boolean;
}

export interface CliRunOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    /** When cancelled, the whole child process tree is terminated. */
    token?: CancellationLike;
    /**
     * Close the child's stdin immediately after spawning. Node gives the child
     * an open stdin pipe that never receives EOF, so a CLI command that prompts
     * for confirmation (e.g. `aitools update`) blocks forever. Ending stdin
     * delivers EOF so the prompt resolves. Only set for non-interactive
     * commands we never feed input to.
     */
    closeStdin?: boolean;
    /**
     * Run the command through the OS shell (Node's `spawn` `shell` option).
     * Used by callers that resolve a bare command name on the PATH (e.g. `az`,
     * the host CLI) rather than an absolute binary path.
     */
    shell?: boolean;
    /**
     * Route the command through `cmd.exe` on Windows (see
     * {@link getEscapedCommandAndArgs}). The buffered/bundle callers set this;
     * callers that spawn a resolved `.exe` path directly leave it off.
     */
    escapeCommandForWindows?: boolean;
    /** Receives decoded stdout chunks as they arrive (e.g. logger narration). */
    onStdout?: (chunk: string) => void;
    /** Receives decoded stderr chunks as they arrive (e.g. the "Show Logs" channel). */
    onStderr?: (chunk: string) => void;
    /**
     * Grace period (ms) between the graceful `SIGTERM` on cancel and the
     * `SIGKILL` escalation. Defaults to {@link DEFAULT_KILL_GRACE_MS}.
     */
    killGraceMs?: number;
    /** Injectable spawn seam (defaults to Node's `spawn`). */
    spawnFn?: SpawnFn;
    /** Injectable graceful process-tree terminator (SIGTERM; the first attempt). */
    terminateFn?: TerminateFn;
    /** Injectable forceful process-tree terminator (SIGKILL; the escalation). */
    forceTerminateFn?: TerminateFn;
}

/**
 * Run a child process and resolve with its captured output and exit code.
 *
 * The single low-level execution seam behind every request/response CLI call
 * (buffered helpers, bundle streaming, and the python-setup client). It carries
 * no `vscode` import so it is fully unit-testable via the injected spawn seam.
 *
 * Resolves on **any** process exit — a non-zero exit is not an error here;
 * policy on the exit code belongs to the caller. A cancelled run resolves with
 * `cancelled: true`. Rejects only on a genuine spawn/stream failure (e.g.
 * `ENOENT`, `EPIPE`).
 */
export function run(
    command: string,
    args: string[],
    options: CliRunOptions = {}
): Promise<CliRunResult> {
    const spawnFn = options.spawnFn ?? (nodeSpawn as unknown as SpawnFn);
    const terminateFn = options.terminateFn ?? defaultTerminate;
    const forceTerminateFn = options.forceTerminateFn ?? defaultForceTerminate;
    const killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
    const {
        cmd,
        args: spawnArgs,
        windowsVerbatimArguments,
    } = options.escapeCommandForWindows
        ? getEscapedCommandAndArgs(command, args)
        : {cmd: command, args, windowsVerbatimArguments: undefined};

    return new Promise<CliRunResult>((resolve, reject) => {
        let child: ChildProcessWithoutNullStreams;
        try {
            child = spawnFn(cmd, spawnArgs, {
                cwd: options.cwd,
                env: options.env,
                // Give the child its own process group on POSIX so cancellation
                // can kill the whole tree. On Windows `detached` opens a new
                // console; taskkill /T handles the tree there, so leave it off.
                detached: process.platform !== "win32",
                shell: options.shell,
                windowsVerbatimArguments,
            });
        } catch (e) {
            reject(e as Error);
            return;
        }

        if (options.closeStdin) {
            child.stdin?.end();
        }

        // Accumulate raw bytes and decode once at the end: a multi-byte UTF-8
        // sequence can straddle two "data" events, and decoding each chunk in
        // isolation would corrupt it. Chunks streamed to onStdout/onStderr go
        // through a StringDecoder that holds back a trailing partial code point
        // until the next chunk (or the final flush at close).
        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        const stdoutStreamDecoder = new StringDecoder("utf8");
        const stderrStreamDecoder = new StringDecoder("utf8");
        let settled = false;
        let cancelled = false;
        // Declared before `finish` (which touches them) so a token that fires
        // synchronously on subscription can't hit a temporal-dead-zone error.
        let cancelSub: {dispose(): void} | undefined;
        let forceKillTimer: NodeJS.Timeout | undefined;

        const finish = (fn: () => void) => {
            if (settled) {
                return;
            }
            settled = true;
            if (forceKillTimer) {
                clearTimeout(forceKillTimer);
            }
            cancelSub?.dispose();
            fn();
        };

        // Best-effort terminate that can never throw out of an event handler
        // (e.g. the child is already gone).
        const safeTerminate = (fn: TerminateFn) => {
            try {
                fn(child);
            } catch {
                // ignore
            }
        };

        const settleResult = (exitCode: number | null) =>
            finish(() => {
                // Flush any partial trailing byte each streaming decoder held
                // back, so the callbacks don't miss the final fragment.
                if (options.onStdout) {
                    const tail = stdoutStreamDecoder.end();
                    if (tail) {
                        options.onStdout(tail);
                    }
                }
                if (options.onStderr) {
                    const tail = stderrStreamDecoder.end();
                    if (tail) {
                        options.onStderr(tail);
                    }
                }
                resolve({
                    stdout: Buffer.concat(stdoutChunks).toString("utf8"),
                    stderr: Buffer.concat(stderrChunks).toString("utf8"),
                    exitCode,
                    cancelled,
                });
            });

        const requestCancel = () => {
            cancelled = true;
            // Graceful first, then escalate: signal the tree with SIGTERM and
            // wait for "close" (so the result reflects a confirmed teardown, and
            // the capture listeners stop when the process actually exits). If the
            // child ignores SIGTERM within the grace window, force-kill the tree
            // with SIGKILL — which it cannot ignore — so the run always settles
            // and never leaves a detached CLI alive after the caller moves on.
            safeTerminate(terminateFn);
            if (!settled) {
                forceKillTimer = setTimeout(() => {
                    if (!settled) {
                        safeTerminate(forceTerminateFn);
                    }
                }, killGraceMs);
                // Don't let the grace timer keep the event loop (or the test
                // runner) alive on its own.
                forceKillTimer.unref?.();
            }
        };
        child.stdout.on("data", (b: Buffer) => {
            stdoutChunks.push(b);
            if (options.onStdout) {
                const text = stdoutStreamDecoder.write(b);
                if (text) {
                    options.onStdout(text);
                }
            }
        });
        child.stderr.on("data", (b: Buffer) => {
            stderrChunks.push(b);
            if (options.onStderr) {
                const text = stderrStreamDecoder.write(b);
                if (text) {
                    options.onStderr(text);
                }
            }
        });

        // A stream-level error (e.g. EPIPE) would otherwise be an unhandled
        // "error" event, which Node throws as an uncaught exception in the
        // extension host. The child is live here, and POSIX children are
        // detached, so terminate the whole tree before rejecting — otherwise it
        // keeps running (and mutating state) after the caller sees a failure.
        const rejectFromStreamError = (err: Error) =>
            finish(() => {
                safeTerminate(terminateFn);
                reject(err);
            });
        child.stdout.on("error", rejectFromStreamError);
        child.stderr.on("error", rejectFromStreamError);
        // A spawn-level "error" (e.g. ENOENT) means no process is running, so
        // there is nothing to terminate.
        child.on("error", (err: Error) => finish(() => reject(err)));

        child.on("close", (code) => settleResult(code));

        // Subscribe only after the child listeners (especially "close") are
        // attached: an already-cancelled token can fire `requestCancel`
        // synchronously here, and its terminate may make the child close at
        // once — which would be missed if "close" weren't wired up yet.
        cancelSub = options.token?.onCancellationRequested(requestCancel);
        // If the token fired synchronously, the run already settled before
        // `cancelSub` was assigned, so `finish` couldn't dispose it — do so now.
        if (settled) {
            cancelSub?.dispose();
        }
    });
}
