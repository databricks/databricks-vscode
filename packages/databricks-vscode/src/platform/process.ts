import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

/**
 * The process seam. Every child process the extension starts goes
 * through it: one-shot commands through `run`, long-running ones through
 * `start`. It carries no `vscode` import, and spawning and killing are
 * injectable, so all of it is unit-tested without real processes.
 *
 * Ported from the old `cli/cliProcess.ts`. Cancellation is an `AbortSignal`
 * rather than a `CancellationToken`.
 */

/** Injectable spawn seam. The real implementation is Node's `child_process.spawn`. */
export type SpawnFn = (
    command: string,
    args: string[],
    options: {
        cwd?: string;
        env?: NodeJS.ProcessEnv;
        detached?: boolean;
        shell?: boolean;
        windowsVerbatimArguments?: boolean;
    },
) => ChildProcessWithoutNullStreams;

/** Injectable process-tree terminator. */
type TerminateFn = (child: ChildProcessWithoutNullStreams) => void;

/** OS primitives used by `terminateProcessTree`, injectable for tests. */
export interface TerminatePrimitives {
    platform: NodeJS.Platform;
    /** Sends `signal` to `pid`; a negative pid targets the process group. */
    kill(pid: number, signal: NodeJS.Signals): void;
    /** A fire-and-forget helper process, such as `taskkill`. */
    spawnHelper(command: string, args: string[]): void;
}

const realTerminatePrimitives: TerminatePrimitives = {
    platform: process.platform,
    kill: (pid, signal) => process.kill(pid, signal),
    spawnHelper: (command, args) => {
        // Unref so the helper can't keep the event loop alive, and swallow a
        // spawn error (taskkill not on PATH) so it can't become an uncaught
        // exception in the extension host.
        const helper = nodeSpawn(command, args);
        helper.unref();
        helper.on("error", () => {});
    },
};

/**
 * Kills the whole process tree. On Windows a plain `SIGTERM` doesn't reach a
 * CLI spawned through `cmd.exe`, so the tree is force-killed with
 * `taskkill /T /F`. On POSIX the child leads its own process group (it is
 * spawned detached), so signalling the negated pid also reaches grandchildren
 * such as `uv`; if the group is already gone, the child is killed directly.
 */
export function terminateProcessTree(
    child: ChildProcessWithoutNullStreams,
    prims: TerminatePrimitives = realTerminatePrimitives,
    signal: NodeJS.Signals = "SIGTERM",
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
            // The group is gone or the child isn't its leader: kill directly.
        }
    }
    child.kill(signal);
}

const defaultTerminate: TerminateFn = (child) => terminateProcessTree(child);
const defaultForceTerminate: TerminateFn = (child) =>
    terminateProcessTree(child, realTerminatePrimitives, "SIGKILL");

/** How long a cancelled child may ignore `SIGTERM` before it gets `SIGKILL`. */
const DEFAULT_KILL_GRACE_MS = 5000;

/**
 * Escapes a command for `cmd.exe` on Windows: `/d` disables AutoRun, `/c`
 * runs and exits, and the whole command is one double-quoted string passed
 * with `windowsVerbatimArguments`, so paths with spaces survive Node's own
 * quoting. On POSIX the command is unchanged.
 */
export function getEscapedCommandAndArgs(
    command: string,
    args: string[],
    platform: NodeJS.Platform = process.platform,
): { cmd: string; args: string[]; windowsVerbatimArguments?: boolean } {
    if (platform === "win32") {
        return {
            cmd: "cmd.exe",
            args: ["/d", "/c", `""${command}" ${args.map((a) => `"${a}"`).join(" ")}"`],
            windowsVerbatimArguments: true,
        };
    }
    return { cmd: command, args };
}

export interface RunResult {
    /** Full stdout, decoded once at the end, so a split code point survives. */
    readonly stdout: string;
    readonly stderr: string;
    /** The exit code, or `null` when the process was killed by a signal. */
    readonly exitCode: number | null;
    /** True when the run was aborted through its signal. */
    readonly cancelled: boolean;
}

export interface RunOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    /** Aborting terminates the whole process tree. */
    signal?: AbortSignal;
    /**
     * Written to stdin, which is then closed. Use it for secrets, such as the
     * token `databricks configure` reads, so they never appear in argv.
     */
    input?: string;
    /**
     * Closes stdin right after spawning, so a CLI prompt reads EOF instead of
     * blocking forever. Implied by `input`.
     */
    closeStdin?: boolean;
    /** Runs through the OS shell, for bare command names such as `az`. */
    shell?: boolean;
    /** Routes the command through `cmd.exe` on Windows (`getEscapedCommandAndArgs`). */
    escapeCommandForWindows?: boolean;
    /** Decoded stdout chunks as they arrive. */
    onStdout?: (chunk: string) => void;
    /** Decoded stderr chunks as they arrive. */
    onStderr?: (chunk: string) => void;
    /** Grace period between `SIGTERM` and `SIGKILL` on cancellation. */
    killGraceMs?: number;
    spawnFn?: SpawnFn;
    terminateFn?: TerminateFn;
    forceTerminateFn?: TerminateFn;
}

/**
 * Runs a child process and resolves with its output and exit code.
 *
 * Resolves on any exit: a non-zero code is not an error here, because what it
 * means is the caller's policy. A cancelled run resolves with `cancelled:
 * true`. Rejects only when the process can't be spawned or a stream fails
 * (`ENOENT`, `EPIPE`).
 */
export function run(command: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
    return new Promise<RunResult>((resolve, reject) => {
        spawnChild(command, args, options, { onExit: resolve, onError: reject });
    });
}

/** A long-running process started by `start`. */
export interface ProcessHandle {
    readonly pid: number | undefined;
    /** Settles when the process exits, like `run`. */
    readonly exited: Promise<RunResult>;
    /** Terminates the process tree, escalating to `SIGKILL` after the grace period. */
    kill(): void;
}

export interface StartOptions extends Omit<RunOptions, "onStdout" | "onStderr"> {
    /** Complete stdout lines, without their line ending. */
    onStdoutLine?: (line: string) => void;
    /** Complete stderr lines, without their line ending. */
    onStderrLine?: (line: string) => void;
}

/**
 * Starts a long-running process, such as `bundle sync --watch`. Output is
 * delivered line by line, so an event split across two chunks arrives whole;
 * a final line without a newline is delivered when the process exits.
 */
export function start(command: string, args: string[], options: StartOptions = {}): ProcessHandle {
    const out = new LineBuffer(options.onStdoutLine);
    const err = new LineBuffer(options.onStderrLine);
    const controller = new AbortController();
    const signal = options.signal
        ? AbortSignal.any([options.signal, controller.signal])
        : controller.signal;
    let pid: number | undefined;
    const exited = new Promise<RunResult>((resolve, reject) => {
        const child = spawnChild(
            command,
            args,
            {
                ...options,
                signal,
                onStdout: (chunk) => out.write(chunk),
                onStderr: (chunk) => err.write(chunk),
            },
            {
                onExit: (result) => {
                    out.end();
                    err.end();
                    resolve(result);
                },
                onError: reject,
            },
        );
        pid = child?.pid;
    });
    return {
        get pid() {
            return pid;
        },
        exited,
        kill: () => controller.abort(),
    };
}

/** Splits decoded text into lines; `\r\n` and `\n` both end a line. */
export class LineBuffer {
    private pending = "";

    constructor(private readonly onLine?: (line: string) => void) {}

    write(chunk: string): void {
        if (this.onLine === undefined) {
            return;
        }
        this.pending += chunk;
        let newline = this.pending.indexOf("\n");
        while (newline !== -1) {
            this.onLine(this.pending.slice(0, newline).replace(/\r$/, ""));
            this.pending = this.pending.slice(newline + 1);
            newline = this.pending.indexOf("\n");
        }
    }

    /** Delivers a last line that has no line ending. */
    end(): void {
        if (this.pending !== "" && this.onLine !== undefined) {
            this.onLine(this.pending.replace(/\r$/, ""));
        }
        this.pending = "";
    }
}

/** What `kernel/cli` and the tests depend on, rather than the functions above. */
export interface ProcessRunner {
    run(command: string, args: string[], options?: RunOptions): Promise<RunResult>;
    start(command: string, args: string[], options?: StartOptions): ProcessHandle;
}

export const nodeProcessRunner: ProcessRunner = { run, start };

function spawnChild(
    command: string,
    args: string[],
    options: RunOptions,
    callbacks: { onExit: (result: RunResult) => void; onError: (err: Error) => void },
): ChildProcessWithoutNullStreams | undefined {
    const spawnFn = options.spawnFn ?? nodeSpawn;
    const terminateFn = options.terminateFn ?? defaultTerminate;
    const forceTerminateFn = options.forceTerminateFn ?? defaultForceTerminate;
    const killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
    const {
        cmd,
        args: spawnArgs,
        windowsVerbatimArguments,
    } = options.escapeCommandForWindows
        ? getEscapedCommandAndArgs(command, args)
        : { cmd: command, args, windowsVerbatimArguments: undefined };

    let child: ChildProcessWithoutNullStreams;
    try {
        child = spawnFn(cmd, spawnArgs, {
            cwd: options.cwd,
            env: options.env,
            // Its own process group on POSIX, so cancellation can kill the
            // tree. On Windows `detached` opens a console; taskkill /T
            // handles the tree there.
            detached: process.platform !== "win32",
            shell: options.shell,
            windowsVerbatimArguments,
        });
    } catch (e) {
        callbacks.onError(e instanceof Error ? e : new Error(String(e)));
        return undefined;
    }

    // A child that exits without reading its input fails the write with
    // EPIPE. Unhandled, that is an uncaught exception in the extension host.
    // The child's exit code and stderr say why it exited, so the run still
    // settles on "close" and this error adds nothing.
    child.stdin?.on("error", () => {});
    if (options.input !== undefined) {
        child.stdin?.end(options.input);
    } else if (options.closeStdin) {
        child.stdin?.end();
    }

    // Raw bytes are kept and decoded once at the end: a multi-byte sequence can
    // straddle two "data" events. Streamed chunks go through a StringDecoder,
    // which holds back a partial code point until the next chunk.
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");
    let settled = false;
    let cancelled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;
    const signal = options.signal;

    const finish = (fn: () => void) => {
        if (settled) {
            return;
        }
        settled = true;
        if (forceKillTimer) {
            clearTimeout(forceKillTimer);
        }
        signal?.removeEventListener("abort", requestCancel);
        fn();
    };

    // Terminating can never throw out of an event handler.
    const safeTerminate = (fn: TerminateFn) => {
        try {
            fn(child);
        } catch {
            // The child is already gone.
        }
    };

    const settleResult = (exitCode: number | null) =>
        finish(() => {
            if (options.onStdout) {
                const tail = stdoutDecoder.end();
                if (tail) {
                    options.onStdout(tail);
                }
            }
            if (options.onStderr) {
                const tail = stderrDecoder.end();
                if (tail) {
                    options.onStderr(tail);
                }
            }
            callbacks.onExit({
                stdout: Buffer.concat(stdoutChunks).toString("utf8"),
                stderr: Buffer.concat(stderrChunks).toString("utf8"),
                exitCode,
                cancelled,
            });
        });

    // Graceful first: SIGTERM the tree and wait for "close", so the result
    // reflects a confirmed teardown. A child that ignores it within the grace
    // period gets SIGKILL, so a cancelled run always settles.
    function requestCancel() {
        cancelled = true;
        safeTerminate(terminateFn);
        if (!settled) {
            forceKillTimer = setTimeout(() => {
                if (!settled) {
                    safeTerminate(forceTerminateFn);
                }
            }, killGraceMs);
            forceKillTimer.unref?.();
        }
    }

    child.stdout.on("data", (b: Buffer) => {
        stdoutChunks.push(b);
        if (options.onStdout) {
            const text = stdoutDecoder.write(b);
            if (text) {
                options.onStdout(text);
            }
        }
    });
    child.stderr.on("data", (b: Buffer) => {
        stderrChunks.push(b);
        if (options.onStderr) {
            const text = stderrDecoder.write(b);
            if (text) {
                options.onStderr(text);
            }
        }
    });

    // A stream error (EPIPE) would otherwise be an uncaught exception in the
    // extension host. The detached child is still running, so kill the tree
    // before rejecting.
    const rejectFromStreamError = (err: Error) =>
        finish(() => {
            safeTerminate(terminateFn);
            callbacks.onError(err);
        });
    child.stdout.on("error", rejectFromStreamError);
    child.stderr.on("error", rejectFromStreamError);
    // A spawn error (ENOENT) means no process is running.
    child.on("error", (err: Error) => finish(() => callbacks.onError(err)));
    child.on("close", (code: number | null) => settleResult(code));

    // Subscribe only after "close" is wired: an already-aborted signal
    // cancels at once, and its terminate may close the child immediately.
    if (signal?.aborted) {
        requestCancel();
    } else {
        signal?.addEventListener("abort", requestCancel, { once: true });
    }
    return child;
}
