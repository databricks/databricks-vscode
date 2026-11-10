/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
    getEscapedCommandAndArgs,
    LineBuffer,
    run,
    start,
    terminateProcessTree,
    type SpawnFn,
    type TerminatePrimitives,
} from "./process";

/**
 * A fake child that emits scripted stdout and stderr, then closes. Output may
 * be a string or raw byte chunks, so a payload can be split across "data"
 * events.
 */
function fakeSpawn(script: {
    stdout?: string | Buffer[];
    stderr?: string | Buffer[];
    code?: number;
    spawnError?: Error;
    onKill?: () => void;
    onStdinEnd?: (input?: string) => void;
    /** Fails the write to stdin, as a pipe does when the child exits without reading it (EPIPE). */
    stdinError?: Error;
    captureArgs?: (cmd: string, args: string[], opts: any) => void;
}): SpawnFn {
    const toChunks = (v?: string | Buffer[]): Buffer[] =>
        v === undefined ? [] : typeof v === "string" ? [Buffer.from(v)] : v;
    return ((cmd: string, args: string[], opts: any) => {
        script.captureArgs?.(cmd, args, opts);
        const child: any = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        const stdin = Object.assign(new EventEmitter(), {
            end: (input?: string) => {
                script.onStdinEnd?.(input);
                const error = script.stdinError;
                if (error !== undefined) {
                    // Before the exit, as a failed write is reported.
                    process.nextTick(() => stdin.emit("error", error));
                }
            },
        });
        child.stdin = stdin;
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

/** A process that hangs until killed, then closes as a SIGTERM'd process would. */
const hangingSpawn: SpawnFn = (() => {
    const child: any = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = Object.assign(new EventEmitter(), { end: () => {} });
    child.kill = () => child.emit("close", null);
    child.pid = 1234;
    return child;
}) as unknown as SpawnFn;

/** A signal that aborts on the next tick. */
function nextTickAbort(): AbortSignal {
    const controller = new AbortController();
    setImmediate(() => controller.abort());
    return controller.signal;
}

describe("process.run", () => {
    it("captures stdout, stderr and the exit code on a normal exit", async () => {
        const result = await run("/fake/cli", ["version"], {
            spawnFn: fakeSpawn({ stdout: "hello", stderr: "warn", code: 0 }),
        });
        expect(result).toEqual({ stdout: "hello", stderr: "warn", exitCode: 0, cancelled: false });
    });

    it("resolves on a non-zero exit, reporting the code", async () => {
        const result = await run("/fake/cli", ["bundle", "deploy"], {
            spawnFn: fakeSpawn({ stderr: "boom", code: 1 }),
        });
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toBe("boom");
    });

    it("spawns the command in the given cwd and env", async () => {
        let seen: { cmd: string; args: string[]; opts: any } | undefined;
        await run("/custom/cli", ["auth", "profiles"], {
            cwd: "/my/project",
            env: { DATABRICKS_CONFIG_PROFILE: "prod" },
            spawnFn: fakeSpawn({ captureArgs: (cmd, args, opts) => (seen = { cmd, args, opts }) }),
        });
        expect(seen?.cmd).toBe("/custom/cli");
        expect(seen?.args).toEqual(["auth", "profiles"]);
        expect(seen?.opts.cwd).toBe("/my/project");
        expect(seen?.opts.env).toEqual({ DATABRICKS_CONFIG_PROFILE: "prod" });
    });

    it("forwards the shell option to spawn", async () => {
        let shell: boolean | undefined;
        await run("az", ["--version"], {
            shell: true,
            spawnFn: fakeSpawn({ captureArgs: (_c, _a, opts) => (shell = opts.shell) }),
        });
        expect(shell).toBe(true);
    });

    it("spawns detached on POSIX so the whole process group can be killed", async () => {
        let detached: boolean | undefined;
        await run("/fake/cli", [], {
            spawnFn: fakeSpawn({ captureArgs: (_c, _a, opts) => (detached = opts.detached) }),
        });
        expect(detached).toBe(process.platform !== "win32");
    });

    it("streams decoded stdout and stderr chunks to the callbacks", async () => {
        const out: string[] = [];
        const err: string[] = [];
        await run("/fake/cli", [], {
            spawnFn: fakeSpawn({ stdout: "line1\n", stderr: "warn\n" }),
            onStdout: (c) => out.push(c),
            onStderr: (c) => err.push(c),
        });
        expect(out.join("")).toBe("line1\n");
        expect(err.join("")).toBe("warn\n");
    });

    it("decodes a multi-byte char split across two stdout chunks", async () => {
        const bytes = Buffer.from("a…b", "utf8");
        const cut = bytes.indexOf(0xe2) + 1;
        const result = await run("/fake/cli", [], {
            spawnFn: fakeSpawn({ stdout: [bytes.subarray(0, cut), bytes.subarray(cut)] }),
        });
        expect(result.stdout).toBe("a…b");
    });

    it("flushes a partial trailing stderr byte to onStderr at close", async () => {
        const full = Buffer.from("done…", "utf8");
        const logs: string[] = [];
        await run("/fake/cli", [], {
            spawnFn: fakeSpawn({ stderr: [full.subarray(0, full.length - 1)] }),
            onStderr: (c) => logs.push(c),
        });
        const joined = logs.join("");
        expect(joined.startsWith("done")).toBe(true);
        expect(joined.length).toBeGreaterThan("done".length);
    });

    it("ends the child's stdin when closeStdin is set", async () => {
        let ended = false;
        await run("/fake/cli", [], {
            closeStdin: true,
            spawnFn: fakeSpawn({ onStdinEnd: () => (ended = true) }),
        });
        expect(ended).toBe(true);
    });

    it("writes input to stdin and closes it", async () => {
        let written: string | undefined;
        await run("/fake/cli", ["configure"], {
            input: "dapi-secret\n",
            spawnFn: fakeSpawn({ onStdinEnd: (input) => (written = input) }),
        });
        expect(written).toBe("dapi-secret\n");
    });

    it("settles with the child's exit when it exits without reading its input (EPIPE on stdin)", async () => {
        const result = await run("/fake/cli", ["configure"], {
            input: "dapi-secret\n",
            spawnFn: fakeSpawn({
                stdinError: Object.assign(new Error("write EPIPE"), { code: "EPIPE" }),
                stderr: "Error: invalid host\n",
                code: 1,
            }),
        });
        expect(result).toEqual({
            stdout: "",
            stderr: "Error: invalid host\n",
            exitCode: 1,
            cancelled: false,
        });
    });

    it("rejects when the process fails to spawn", async () => {
        await expect(
            run("/missing/cli", [], {
                spawnFn: fakeSpawn({ spawnError: new Error("spawn ENOENT") }),
            }),
        ).rejects.toThrow(/ENOENT/);
    });

    it("terminates the child through the injected terminator and reports cancelled", async () => {
        let terminated: any;
        const result = await run("/fake/cli", [], {
            signal: nextTickAbort(),
            spawnFn: hangingSpawn,
            terminateFn: (child) => {
                terminated = child;
                (child as any).kill();
            },
        });
        expect(terminated?.pid).toBe(1234);
        expect(result.cancelled).toBe(true);
    });

    it("stops listening to the signal after a normal exit", async () => {
        const controller = new AbortController();
        let terminated = false;
        await run("/fake/cli", [], {
            signal: controller.signal,
            spawnFn: fakeSpawn({ stdout: "ok" }),
            terminateFn: () => (terminated = true),
        });
        controller.abort();
        expect(terminated).toBe(false);
    });

    it("does not let a throwing terminator escape cancellation", async () => {
        const result = await run("/fake/cli", [], {
            signal: nextTickAbort(),
            spawnFn: hangingSpawn,
            terminateFn: (child) => {
                (child as any).kill();
                throw new Error("kill failed");
            },
        });
        expect(result.cancelled).toBe(true);
    });

    /** A child that ignores SIGTERM; `forceClose` simulates SIGKILL landing. */
    function ignoresSigtermSpawn(): { spawn: SpawnFn; forceClose: () => void } {
        const child: any = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.stdin = Object.assign(new EventEmitter(), { end: () => {} });
        child.pid = 4242;
        child.kill = () => {};
        return {
            spawn: (() => child) as unknown as SpawnFn,
            forceClose: () => child.emit("close", null),
        };
    }

    it("escalates to a force kill when the graceful terminate is ignored, then settles on close", async () => {
        const { spawn, forceClose } = ignoresSigtermSpawn();
        let soft = false;
        let force = false;
        const result = await run("/fake/cli", [], {
            signal: nextTickAbort(),
            spawnFn: spawn,
            killGraceMs: 5,
            terminateFn: () => (soft = true),
            forceTerminateFn: () => {
                force = true;
                forceClose();
            },
        });
        expect(soft).toBe(true);
        expect(force).toBe(true);
        expect(result.cancelled).toBe(true);
    });

    it("does not escalate when the graceful terminate closes the process", async () => {
        let force = false;
        const result = await run("/fake/cli", [], {
            signal: nextTickAbort(),
            spawnFn: hangingSpawn,
            killGraceMs: 5,
            terminateFn: (child) => (child as any).kill(),
            forceTerminateFn: () => (force = true),
        });
        expect(result.cancelled).toBe(true);
        expect(force).toBe(false);
    });

    it("cancels at once when the signal is already aborted", async () => {
        const controller = new AbortController();
        controller.abort();
        const result = await run("/fake/cli", [], {
            signal: controller.signal,
            spawnFn: hangingSpawn,
            terminateFn: (child) => (child as any).kill(),
        });
        expect(result.cancelled).toBe(true);
    });

    it("terminates the process tree when a stdout stream error occurs", async () => {
        let terminated = false;
        const erroringSpawn: SpawnFn = (() => {
            const child: any = new EventEmitter();
            child.stdout = new EventEmitter();
            child.stderr = new EventEmitter();
            child.stdin = Object.assign(new EventEmitter(), { end: () => {} });
            child.pid = 99;
            child.kill = () => {};
            setImmediate(() => child.stdout.emit("error", new Error("EPIPE")));
            return child;
        }) as unknown as SpawnFn;
        await expect(
            run("/fake/cli", [], {
                spawnFn: erroringSpawn,
                terminateFn: () => (terminated = true),
            }),
        ).rejects.toThrow(/EPIPE/);
        expect(terminated).toBe(true);
    });
});

describe("process.start", () => {
    it("delivers whole lines, even when a line is split across chunks", async () => {
        const lines: string[] = [];
        const handle = start("/fake/cli", ["sync", "--watch"], {
            spawnFn: fakeSpawn({
                stdout: [Buffer.from('{"a":'), Buffer.from('1}\r\n{"b":2}\npartial')],
            }),
            onStdoutLine: (l) => lines.push(l),
        });
        const result = await handle.exited;
        expect(lines).toEqual(['{"a":1}', '{"b":2}', "partial"]);
        expect(result.exitCode).toBe(0);
    });

    it("kills the process tree on kill()", async () => {
        let terminated = false;
        const handle = start("/fake/cli", [], {
            spawnFn: hangingSpawn,
            terminateFn: (child) => {
                terminated = true;
                (child as any).kill();
            },
        });
        expect(handle.pid).toBe(1234);
        handle.kill();
        const result = await handle.exited;
        expect(terminated).toBe(true);
        expect(result.cancelled).toBe(true);
    });
});

describe("LineBuffer", () => {
    it("keeps a partial line until it completes", () => {
        const lines: string[] = [];
        const buffer = new LineBuffer((l) => lines.push(l));
        buffer.write("ab");
        expect(lines).toEqual([]);
        buffer.write("c\nd");
        buffer.end();
        expect(lines).toEqual(["abc", "d"]);
    });
});

describe("getEscapedCommandAndArgs", () => {
    it("passes the command through unchanged on POSIX", () => {
        expect(getEscapedCommandAndArgs("/bin/databricks", ["bundle", "deploy"], "linux")).toEqual({
            cmd: "/bin/databricks",
            args: ["bundle", "deploy"],
        });
    });

    it("wraps the command in cmd.exe with verbatim args on Windows", () => {
        const { cmd, args, windowsVerbatimArguments } = getEscapedCommandAndArgs(
            "C:\\bin\\databricks.exe",
            ["bundle", "deploy"],
            "win32",
        );
        expect(cmd).toBe("cmd.exe");
        expect(args).toEqual(["/d", "/c", '""C:\\bin\\databricks.exe" "bundle" "deploy""']);
        expect(windowsVerbatimArguments).toBe(true);
    });
});

describe("terminateProcessTree", () => {
    function harness(platform: NodeJS.Platform, killThrows = false) {
        const calls = {
            groupKill: [] as [number, NodeJS.Signals][],
            spawned: [] as [string, string[]][],
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
        return { calls, prims, child };
    }

    it("kills the negated pid (process group) with SIGTERM on POSIX", () => {
        const { calls, prims, child } = harness("linux");
        terminateProcessTree(child, prims);
        expect(calls.groupKill).toEqual([[-4321, "SIGTERM"]]);
        expect(calls.directKill).toEqual([]);
    });

    it("signals the process group with the given signal (SIGKILL escalation)", () => {
        const { calls, prims, child } = harness("linux");
        terminateProcessTree(child, prims, "SIGKILL");
        expect(calls.groupKill).toEqual([[-4321, "SIGKILL"]]);
    });

    it("falls back to a direct child kill when the group is already gone", () => {
        const { calls, prims, child } = harness("darwin", true);
        terminateProcessTree(child, prims);
        expect(calls.directKill).toEqual(["SIGTERM"]);
    });

    it("shells taskkill /T /F with the string pid on Windows", () => {
        const { calls, prims, child } = harness("win32");
        terminateProcessTree(child, prims);
        expect(calls.spawned).toEqual([["taskkill", ["/pid", "4321", "/T", "/F"]]]);
        expect(calls.directKill).toEqual([]);
    });

    it("falls back to a direct kill when the child has no pid", () => {
        const { calls, prims, child } = harness("linux");
        child.pid = undefined;
        terminateProcessTree(child, prims);
        expect(calls.groupKill).toEqual([]);
        expect(calls.directKill).toEqual(["SIGTERM"]);
    });

    it("falls back to a direct kill on Windows when the child has no pid", () => {
        const { calls, prims, child } = harness("win32");
        child.pid = undefined;
        terminateProcessTree(child, prims);
        expect(calls.spawned).toEqual([]);
        expect(calls.directKill).toEqual(["SIGTERM"]);
    });
});
