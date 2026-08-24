import {expect} from "chai";
import {EventEmitter} from "node:events";
import {
    run,
    SpawnFn,
    TerminatePrimitives,
    terminateProcessTree,
    getEscapedCommandAndArgs,
} from "./cliProcess";

/**
 * A fake child process that emits scripted stdout/stderr then closes. Lets us
 * drive {@link run} without spawning a real binary. `stdout`/`stderr` may be a
 * single string or a list of raw byte chunks, so tests can reproduce a payload
 * split across "data" events (e.g. a multi-byte char straddling the boundary).
 */
function fakeSpawn(script: {
    stdout?: string | Buffer[];
    stderr?: string | Buffer[];
    code?: number;
    spawnError?: Error;
    onKill?: () => void;
    onStdinEnd?: () => void;
    captureArgs?: (cmd: string, args: string[], opts: any) => void;
}): SpawnFn {
    const toChunks = (v?: string | Buffer[]): Buffer[] => {
        if (v === undefined) {
            return [];
        }
        return typeof v === "string" ? [Buffer.from(v)] : v;
    };
    return ((cmd: string, args: string[], opts: any) => {
        script.captureArgs?.(cmd, args, opts);
        const child: any = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.stdin = {end: () => script.onStdinEnd?.()};
        child.kill = () => script.onKill?.();
        setImmediate(() => {
            if (script.spawnError) {
                child.emit("error", script.spawnError);
                return;
            }
            for (const chunk of toChunks(script.stderr)) {
                child.stderr.emit("data", chunk);
            }
            for (const chunk of toChunks(script.stdout)) {
                child.stdout.emit("data", chunk);
            }
            child.emit("close", script.code ?? 0);
        });
        return child;
    }) as unknown as SpawnFn;
}

describe("cliProcess.run", () => {
    it("captures stdout, stderr and the exit code on a normal exit", async () => {
        const result = await run("/fake/cli", ["version"], {
            spawnFn: fakeSpawn({stdout: "hello", stderr: "warn", code: 0}),
        });
        expect(result.stdout).to.equal("hello");
        expect(result.stderr).to.equal("warn");
        expect(result.exitCode).to.equal(0);
        expect(result.cancelled).to.equal(false);
    });

    it("resolves (does not throw) on a non-zero exit, reporting the code", async () => {
        // Policy on the exit code belongs to the caller, not the gateway: a
        // failing CLI still produced stdout/stderr the adapter may want to read.
        const result = await run("/fake/cli", ["bundle", "deploy"], {
            spawnFn: fakeSpawn({stdout: "", stderr: "boom", code: 1}),
        });
        expect(result.exitCode).to.equal(1);
        expect(result.stderr).to.equal("boom");
    });

    it("spawns the command in the given cwd and env", async () => {
        let seenCmd = "";
        let seenArgs: string[] = [];
        let seenOpts: any;
        await run("/custom/cli", ["auth", "profiles"], {
            cwd: "/my/project",
            /* eslint-disable-next-line @typescript-eslint/naming-convention */
            env: {DATABRICKS_CONFIG_PROFILE: "prod"},
            spawnFn: fakeSpawn({
                captureArgs: (c, a, opts) => {
                    seenCmd = c;
                    seenArgs = a;
                    seenOpts = opts;
                },
            }),
        });
        expect(seenCmd).to.equal("/custom/cli");
        expect(seenArgs).to.deep.equal(["auth", "profiles"]);
        expect(seenOpts.cwd).to.equal("/my/project");
        expect(seenOpts.env).to.deep.equal({
            /* eslint-disable-next-line @typescript-eslint/naming-convention */
            DATABRICKS_CONFIG_PROFILE: "prod",
        });
    });

    it("forwards the shell option to spawn", async () => {
        let seenShell: boolean | undefined;
        await run("az", ["--version"], {
            shell: true,
            spawnFn: fakeSpawn({
                captureArgs: (_c, _a, opts) => {
                    seenShell = opts.shell;
                },
            }),
        });
        expect(seenShell).to.equal(true);
    });

    it("spawns detached on POSIX so the whole process group can be killed", async () => {
        let seenDetached: boolean | undefined;
        await run("/fake/cli", [], {
            spawnFn: fakeSpawn({
                captureArgs: (_c, _a, opts) => {
                    seenDetached = opts.detached;
                },
            }),
        });
        // detached everywhere except Windows (where taskkill /T handles the
        // tree and detached would spawn an extra console window).
        expect(seenDetached).to.equal(process.platform !== "win32");
    });

    it("streams decoded stdout and stderr chunks to the callbacks", async () => {
        const out: string[] = [];
        const err: string[] = [];
        await run("/fake/cli", [], {
            spawnFn: fakeSpawn({stdout: "line1\n", stderr: "warn\n"}),
            onStdout: (c) => out.push(c),
            onStderr: (c) => err.push(c),
        });
        expect(out.join("")).to.equal("line1\n");
        expect(err.join("")).to.equal("warn\n");
    });

    it("decodes a multi-byte char split across two stdout chunks", async () => {
        // "…" (U+2026) is 3 bytes in UTF-8; split it down the middle so each
        // chunk holds a partial code point. Naive per-chunk toString() would
        // corrupt it to U+FFFD.
        const bytes = Buffer.from("a…b", "utf8");
        const cut = bytes.indexOf(0xe2) + 1; // mid-ellipsis
        const result = await run("/fake/cli", [], {
            spawnFn: fakeSpawn({
                stdout: [bytes.subarray(0, cut), bytes.subarray(cut)],
            }),
        });
        expect(result.stdout).to.equal("a…b");
    });

    it("flushes a partial trailing stderr byte to onStderr at close", async () => {
        // stderr ends mid-"…" (U+2026, 3 bytes) and the completing bytes never
        // arrive: the streaming decoder holds the incomplete sequence back on
        // the data event, so the tail must be flushed when the process closes.
        const full = Buffer.from("done…", "utf8");
        const truncated = full.subarray(0, full.length - 1); // drop last byte
        const logs: string[] = [];
        await run("/fake/cli", [], {
            spawnFn: fakeSpawn({stderr: [truncated]}),
            onStderr: (c) => logs.push(c),
        });
        const joined = logs.join("");
        expect(joined.startsWith("done")).to.equal(true);
        expect(joined.length).to.be.greaterThan("done".length);
    });

    it("ends the child's stdin when closeStdin is set", async () => {
        let ended = false;
        await run("/fake/cli", [], {
            closeStdin: true,
            spawnFn: fakeSpawn({onStdinEnd: () => (ended = true)}),
        });
        expect(ended).to.equal(true);
    });

    it("rejects when the process fails to spawn", async () => {
        let threw = false;
        try {
            await run("/missing/cli", [], {
                spawnFn: fakeSpawn({spawnError: new Error("spawn ENOENT")}),
            });
        } catch (e) {
            threw = true;
            expect((e as Error).message).to.contain("ENOENT");
        }
        expect(threw).to.equal(true);
    });

    // A process that hangs until terminated, then emits "close" (as a real
    // SIGTERM'd process would), letting the run promise settle.
    const hangingSpawn: SpawnFn = (() => {
        const child: any = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.stdin = {end: () => {}};
        child.kill = () => child.emit("close", null);
        child.pid = 1234;
        return child;
    }) as unknown as SpawnFn;

    // A cancellation token whose callback fires on the next tick, tracking
    // whether its subscription was disposed.
    function nextTickToken() {
        let disposed = false;
        return {
            disposed: () => disposed,
            token: {
                isCancellationRequested: false,
                onCancellationRequested: (cb: () => void) => {
                    setImmediate(cb);
                    return {
                        dispose() {
                            disposed = true;
                        },
                    };
                },
            },
        };
    }

    it("terminates the child via the injected terminator and reports cancelled", async () => {
        let terminatedChild: any;
        const {token} = nextTickToken();
        const result = await run("/fake/cli", [], {
            token,
            spawnFn: hangingSpawn,
            terminateFn: (child) => {
                terminatedChild = child;
                (child as any).kill();
            },
        });
        expect(terminatedChild?.pid).to.equal(1234);
        expect(result.cancelled).to.equal(true);
    });

    it("disposes the cancellation subscription on a normal exit", async () => {
        const {token, disposed} = nextTickToken();
        // never actually cancels (callback fires but process already closed);
        // use a fast-closing spawn so the run completes normally.
        await run("/fake/cli", [], {
            token: {
                isCancellationRequested: false,
                onCancellationRequested: token.onCancellationRequested,
            },
            spawnFn: fakeSpawn({stdout: "ok"}),
        });
        expect(disposed()).to.equal(true);
    });

    it("does not let a throwing terminator escape cancellation", async () => {
        const {token} = nextTickToken();
        // Must settle cleanly (as cancelled), not blow up synchronously.
        const result = await run("/fake/cli", [], {
            token,
            spawnFn: hangingSpawn,
            terminateFn: (child) => {
                (child as any).kill();
                throw new Error("kill failed");
            },
        });
        expect(result.cancelled).to.equal(true);
    });

    it("settles promptly on cancel even if the process never closes", async () => {
        // A child that ignores termination and never emits "close". The run must
        // still settle (as cancelled) rather than hang forever waiting on close.
        const neverClosingSpawn: SpawnFn = (() => {
            const child: any = new EventEmitter();
            child.stdout = new EventEmitter();
            child.stderr = new EventEmitter();
            child.stdin = {end: () => {}};
            child.pid = 4242;
            child.kill = () => {}; // ignores the signal, never closes
            return child;
        }) as unknown as SpawnFn;
        const {token} = nextTickToken();
        let terminated = false;
        const result = await run("/fake/cli", [], {
            token,
            spawnFn: neverClosingSpawn,
            terminateFn: () => (terminated = true),
        });
        expect(result.cancelled).to.equal(true);
        expect(terminated).to.equal(true);
    });

    it("terminates the process tree when a stdout stream error occurs", async () => {
        // stdout errors mid-run (e.g. EPIPE). Because POSIX children are spawned
        // detached, rejecting without killing would orphan the tree, so the
        // terminator must run before the rejection.
        let terminated = false;
        const erroringSpawn: SpawnFn = (() => {
            const child: any = new EventEmitter();
            child.stdout = new EventEmitter();
            child.stderr = new EventEmitter();
            child.stdin = {end: () => {}};
            child.pid = 99;
            child.kill = () => {};
            setImmediate(() => child.stdout.emit("error", new Error("EPIPE")));
            return child;
        }) as unknown as SpawnFn;
        let threw = false;
        try {
            await run("/fake/cli", [], {
                spawnFn: erroringSpawn,
                terminateFn: () => (terminated = true),
            });
        } catch (e) {
            threw = true;
            expect((e as Error).message).to.contain("EPIPE");
        }
        expect(threw).to.equal(true);
        expect(terminated).to.equal(true);
    });
});

describe("cliProcess.getEscapedCommandAndArgs", () => {
    it("passes the command through unchanged on POSIX", () => {
        const {cmd, args, windowsVerbatimArguments} = getEscapedCommandAndArgs(
            "/bin/databricks",
            ["bundle", "deploy"],
            "linux"
        );
        expect(cmd).to.equal("/bin/databricks");
        expect(args).to.deep.equal(["bundle", "deploy"]);
        expect(windowsVerbatimArguments).to.equal(undefined);
    });

    it("wraps the command in cmd.exe with verbatim args on Windows", () => {
        const {cmd, args, windowsVerbatimArguments} = getEscapedCommandAndArgs(
            "C:\\bin\\databricks.exe",
            ["bundle", "deploy"],
            "win32"
        );
        expect(cmd).to.equal("cmd.exe");
        // /d disables AutoRun, /c runs the command; the whole thing is one
        // double-quoted string so paths/args with spaces survive.
        expect(args[0]).to.equal("/d");
        expect(args[1]).to.equal("/c");
        expect(args[2]).to.equal(
            '""C:\\bin\\databricks.exe" "bundle" "deploy""'
        );
        expect(windowsVerbatimArguments).to.equal(true);
    });
});

describe("terminateProcessTree", () => {
    // Records what the terminator did, plus a fake child whose direct kill()
    // we can observe. `killThrows` simulates the group being gone (ESRCH).
    function harness(platform: NodeJS.Platform, killThrows = false) {
        const calls = {
            groupKill: [] as Array<[number, NodeJS.Signals]>,
            spawned: [] as Array<[string, string[]]>,
            directKill: [] as (NodeJS.Signals | undefined)[],
        };
        const prims: TerminatePrimitives = {
            platform,
            kill: (pid, signal) => {
                if (killThrows) {
                    throw new Error("ESRCH");
                }
                calls.groupKill.push([pid, signal]);
            },
            spawnHelper: (cmd, args) => calls.spawned.push([cmd, args]),
        };
        const child: any = new EventEmitter();
        child.pid = 4321;
        child.kill = (signal?: NodeJS.Signals) => calls.directKill.push(signal);
        return {calls, prims, child};
    }

    it("kills the negated pid (process group) with SIGTERM on POSIX", () => {
        const {calls, prims, child} = harness("linux");
        terminateProcessTree(child, prims);
        expect(calls.groupKill).to.deep.equal([[-4321, "SIGTERM"]]);
        expect(calls.directKill).to.be.empty;
    });

    it("falls back to a direct child kill when the group is already gone", () => {
        const {calls, prims, child} = harness("darwin", /*killThrows*/ true);
        terminateProcessTree(child, prims);
        expect(calls.directKill).to.deep.equal(["SIGTERM"]);
    });

    it("shells taskkill /T /F with the string pid on Windows", () => {
        const {calls, prims, child} = harness("win32");
        terminateProcessTree(child, prims);
        expect(calls.spawned).to.deep.equal([
            ["taskkill", ["/pid", "4321", "/T", "/F"]],
        ]);
        expect(calls.directKill).to.be.empty;
    });

    it("falls back to a direct kill when the child has no pid", () => {
        const {calls, prims, child} = harness("linux");
        child.pid = undefined;
        terminateProcessTree(child, prims);
        expect(calls.groupKill).to.be.empty;
        expect(calls.directKill).to.deep.equal(["SIGTERM"]);
    });

    it("falls back to a direct kill on Windows when the child has no pid", () => {
        const {calls, prims, child} = harness("win32");
        child.pid = undefined;
        terminateProcessTree(child, prims);
        expect(calls.spawned).to.be.empty;
        expect(calls.directKill).to.deep.equal(["SIGTERM"]);
    });
});
