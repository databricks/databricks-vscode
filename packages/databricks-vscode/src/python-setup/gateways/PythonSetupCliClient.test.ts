import {expect} from "chai";
import {EventEmitter} from "node:events";
import {
    PythonSetupCancelledError,
    PythonSetupCliClient,
    SpawnFn,
} from "./PythonSetupCliClient";
import {
    SUCCESS_DEFAULT,
    ERROR_NO_TARGET,
} from "../models/fixtures/setupLocalResults";
import {isReauthRequiredError} from "../utils/authErrors";

/**
 * A fake child process that emits scripted stdout/stderr then closes. Lets us
 * drive the client without spawning a real binary. `stdout`/`stderr` may be a
 * single string or a list of raw byte chunks, so tests can reproduce a payload
 * split across "data" events (e.g. a multi-byte char straddling the boundary).
 */
function fakeSpawn(script: {
    stdout?: string | Buffer[];
    stderr?: string | Buffer[];
    code?: number;
    spawnError?: Error;
    onKill?: () => void;
    captureArgs?: (
        cmd: string,
        args: string[],
        cwd: string | undefined,
        detached: boolean | undefined
    ) => void;
    captureEnv?: (env: NodeJS.ProcessEnv | undefined) => void;
}): SpawnFn {
    const toChunks = (v?: string | Buffer[]): Buffer[] => {
        if (v === undefined) {
            return [];
        }
        return typeof v === "string" ? [Buffer.from(v)] : v;
    };
    return (cmd, args, opts) => {
        script.captureArgs?.(cmd, args, opts.cwd, opts.detached);
        script.captureEnv?.(opts.env);
        const child: any = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.stdin = {end: () => {}};
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
    };
}

const inv = {
    mode: "default" as const,
    compute: {kind: "serverless" as const, version: "5"},
};

describe("PythonSetupCliClient", () => {
    it("parses the JSON result from stdout on success", async () => {
        const client = new PythonSetupCliClient(
            () => "/fake/databricks",
            () => ({}),
            fakeSpawn({stdout: JSON.stringify(SUCCESS_DEFAULT), code: 0})
        );
        const result = await client.run(inv, {cwd: "/proj"});
        expect(result.ok).to.equal(true);
        expect(result.command).to.equal("environments setup-local");
    });

    it("returns the parsed failure result on a non-zero exit with JSON", async () => {
        const client = new PythonSetupCliClient(
            () => "/fake/databricks",
            () => ({}),
            fakeSpawn({stdout: JSON.stringify(ERROR_NO_TARGET), code: 1})
        );
        const result = await client.run(inv, {cwd: "/proj"});
        expect(result.ok).to.equal(false);
        expect(result.error?.code).to.equal("E_NO_TARGET");
    });

    it("spawns the resolved path with setup-local argv in the given cwd", async () => {
        let seenCmd = "";
        let seenArgs: string[] = [];
        let seenCwd: string | undefined = "";
        const client = new PythonSetupCliClient(
            () => "/custom/databricks",
            () => ({}),
            fakeSpawn({
                stdout: JSON.stringify(SUCCESS_DEFAULT),
                captureArgs: (c, a, cwd) => {
                    seenCmd = c;
                    seenArgs = a;
                    seenCwd = cwd;
                },
            })
        );
        await client.run(inv, {cwd: "/my/project"});
        expect(seenCmd).to.equal("/custom/databricks");
        expect(seenArgs.slice(0, 4)).to.deep.equal([
            "environments",
            "setup-local",
            "--serverless-version",
            "5",
        ]);
        expect(seenArgs.slice(-2)).to.deep.equal(["--output", "json"]);
        expect(seenCwd).to.equal("/my/project");
    });

    it("spawns the CLI with the env from the injected env function", async () => {
        // The CLI resolves auth itself, so the workspace's host/profile (and the
        // config-file location) have to arrive as environment variables or the
        // run silently targets whatever profile the CLI resolves on its own.
        let seenEnv: NodeJS.ProcessEnv | undefined;
        const client = new PythonSetupCliClient(
            () => "/fake/databricks",
            () => ({
                /* eslint-disable @typescript-eslint/naming-convention */
                DATABRICKS_HOST: "https://example.cloud.databricks.com",
                DATABRICKS_CONFIG_PROFILE: "my-profile",
                DATABRICKS_CONFIG_FILE: "/custom/.databrickscfg",
                /* eslint-enable @typescript-eslint/naming-convention */
            }),
            fakeSpawn({
                stdout: JSON.stringify(SUCCESS_DEFAULT),
                captureEnv: (env) => {
                    seenEnv = env;
                },
            })
        );
        await client.run(inv, {cwd: "/proj"});
        expect(seenEnv).to.deep.equal({
            /* eslint-disable @typescript-eslint/naming-convention */
            DATABRICKS_HOST: "https://example.cloud.databricks.com",
            DATABRICKS_CONFIG_PROFILE: "my-profile",
            DATABRICKS_CONFIG_FILE: "/custom/.databrickscfg",
            /* eslint-enable @typescript-eslint/naming-convention */
        });
    });

    it("re-reads the env for every run so a reconnect is picked up", async () => {
        // The env function is called per run, not once at construction: the user
        // can switch workspace/profile between setups without a reload.
        const profiles = ["first", "second"];
        let call = 0;
        const seen: (string | undefined)[] = [];
        const client = new PythonSetupCliClient(
            () => "/fake/databricks",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            () => ({DATABRICKS_CONFIG_PROFILE: profiles[call++]}),
            fakeSpawn({
                stdout: JSON.stringify(SUCCESS_DEFAULT),
                captureEnv: (env) => seen.push(env?.DATABRICKS_CONFIG_PROFILE),
            })
        );
        await client.run(inv, {cwd: "/proj"});
        await client.run(inv, {cwd: "/proj"});
        expect(seen).to.deep.equal(["first", "second"]);
    });

    it("spawns detached on POSIX so the process group can be killed", async () => {
        let seenDetached: boolean | undefined;
        const client = new PythonSetupCliClient(
            () => "/fake/databricks",
            () => ({}),
            fakeSpawn({
                stdout: JSON.stringify(SUCCESS_DEFAULT),
                captureArgs: (_c, _a, _cwd, detached) => {
                    seenDetached = detached;
                },
            })
        );
        await client.run(inv, {cwd: "/proj"});
        // detached everywhere except Windows (where taskkill /T handles the
        // tree and detached would spawn an extra console window).
        expect(seenDetached).to.equal(process.platform !== "win32");
    });

    it("forwards captured stderr to the onLog callback", async () => {
        const logs: string[] = [];
        const client = new PythonSetupCliClient(
            () => "/fake/databricks",
            () => ({}),
            fakeSpawn({
                stdout: JSON.stringify(SUCCESS_DEFAULT),
                stderr: "uv: resolving dependencies…\n",
            })
        );
        await client.run(inv, {cwd: "/proj", onLog: (t) => logs.push(t)});
        expect(logs.join("")).to.contain("resolving dependencies");
    });

    it("flushes a partial trailing stderr byte to onLog at close", async () => {
        // stderr ends mid-"…" (U+2026, 3 bytes) and the completing bytes never
        // arrive: the decoder holds the incomplete sequence back on the data
        // event, so the tail must be flushed to onLog when the process closes.
        const full = Buffer.from("done…", "utf8");
        const truncated = full.subarray(0, full.length - 1); // drop last byte
        const logs: string[] = [];
        const client = new PythonSetupCliClient(
            () => "/fake/databricks",
            () => ({}),
            fakeSpawn({
                stdout: JSON.stringify(SUCCESS_DEFAULT),
                stderr: [truncated],
            })
        );
        await client.run(inv, {cwd: "/proj", onLog: (t) => logs.push(t)});
        // "done" arrives on the data event; the held-back partial char is
        // flushed (as U+FFFD) at close rather than being silently dropped.
        const joined = logs.join("");
        expect(joined.startsWith("done")).to.equal(true);
        expect(joined.length).to.be.greaterThan("done".length);
    });

    it("rejects with PythonSetupParseError, appending stderr, when stdout is not valid JSON", async () => {
        const client = new PythonSetupCliClient(
            () => "/fake/databricks",
            () => ({}),
            fakeSpawn({stdout: "not json", stderr: "boom", code: 1})
        );
        let threw = false;
        try {
            await client.run(inv, {cwd: "/proj"});
        } catch (e) {
            threw = true;
            // The parse error stays the surfaced type, with the captured
            // stderr appended so the failure is actionable.
            expect((e as Error).message).to.match(/valid JSON/i);
            expect((e as Error).message).to.contain("boom");
        }
        expect(threw).to.equal(true);
    });

    it("produces a rejection the reauth matcher recognizes (gateway stderr → reauth gate)", async () => {
        // The real shape of an expired-session abort: no JSON on stdout, the
        // CLI's reauth guidance on stderr. This links the gateway's
        // stderr-appending format to `isReauthRequiredError` (the controller's
        // positive gate), so a change to either side that would silently break
        // the re-login prompt fails here instead of in production.
        const authStderr =
            "Error: a new access token could not be retrieved because the " +
            "refresh token is invalid. To reauthenticate, run the following " +
            "command:\n  databricks auth login --profile dev\n";
        const client = new PythonSetupCliClient(
            () => "/fake/databricks",
            () => ({}),
            fakeSpawn({stdout: "", stderr: authStderr, code: 1})
        );
        let message = "";
        try {
            await client.run(inv, {cwd: "/proj"});
        } catch (e) {
            message = (e as Error).message;
        }
        expect(isReauthRequiredError(message)).to.equal(true);
    });

    it("decodes a multi-byte char split across two stdout chunks", async () => {
        // "…" (U+2026) is 3 bytes in UTF-8; split it down the middle so each
        // chunk holds a partial code point. Naive per-chunk toString() would
        // corrupt it to U+FFFD and break JSON.parse.
        const json = JSON.stringify({...SUCCESS_DEFAULT, note: "a…b"});
        const bytes = Buffer.from(json, "utf8");
        const cut = bytes.indexOf(0xe2) + 1; // mid-ellipsis
        const client = new PythonSetupCliClient(
            () => "/fake/databricks",
            () => ({}),
            fakeSpawn({stdout: [bytes.subarray(0, cut), bytes.subarray(cut)]})
        );
        const result = await client.run(inv, {cwd: "/proj"});
        expect(result.ok).to.equal(true);
        expect((result as any).note).to.equal("a…b");
    });

    it("rejects when the process fails to spawn", async () => {
        const client = new PythonSetupCliClient(
            () => "/missing/databricks",
            () => ({}),
            fakeSpawn({spawnError: new Error("ENOENT")})
        );
        let threw = false;
        try {
            await client.run(inv, {cwd: "/proj"});
        } catch (e) {
            threw = true;
            expect((e as Error).message).to.contain("ENOENT");
        }
        expect(threw).to.equal(true);
    });

    // A process that hangs until terminated, then emits "close" (as a real
    // SIGTERM'd process would), letting the run promise settle.
    const hangingSpawn: SpawnFn = () => {
        const child: any = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = () => child.emit("close", null);
        child.pid = 1234;
        return child;
    };

    // A cancellation token whose callback fires on the next tick, tracking
    // whether its subscription was disposed.
    function nextTickToken(): {
        token: {
            isCancellationRequested: boolean;
            onCancellationRequested: (cb: () => void) => {dispose(): void};
        };
        disposed: () => boolean;
    } {
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

    it("terminates the child via the injected terminator on cancellation", async () => {
        let terminatedChild: any;
        const {token} = nextTickToken();
        const client = new PythonSetupCliClient(
            () => "/fake/databricks",
            () => ({}),
            hangingSpawn,
            (child) => {
                terminatedChild = child;
                child.kill();
            }
        );
        await client.run(inv, {cwd: "/proj", token}).catch(() => undefined);
        expect(terminatedChild?.pid).to.equal(1234);
    });

    it("rejects with PythonSetupCancelledError when cancelled", async () => {
        const {token} = nextTickToken();
        const client = new PythonSetupCliClient(
            () => "/fake/databricks",
            () => ({}),
            hangingSpawn,
            (child) => child.kill()
        );
        let caught: unknown;
        await client.run(inv, {cwd: "/proj", token}).catch((e) => (caught = e));
        expect(caught).to.be.instanceOf(PythonSetupCancelledError);
    });

    it("does not spawn and rejects when the token is already cancelled at entry", async () => {
        let spawned = false;
        const preCancelledToken = {
            isCancellationRequested: true,
            onCancellationRequested: () => ({dispose() {}}),
        };
        const spySpawn: SpawnFn = (...a) => {
            spawned = true;
            return hangingSpawn(...a);
        };
        const client = new PythonSetupCliClient(
            () => "/fake/databricks",
            () => ({}),
            spySpawn
        );
        let caught: unknown;
        await client
            .run(inv, {cwd: "/proj", token: preCancelledToken})
            .catch((e) => (caught = e));
        // The mutating CLI must never start for an already-cancelled request.
        expect(spawned).to.equal(false);
        expect(caught).to.be.instanceOf(PythonSetupCancelledError);
    });

    it("disposes the cancellation subscription on a normal exit", async () => {
        // A token that never fires cancel, so the run completes normally; we
        // still expect its listener to be disposed to avoid a leak.
        let disposed = false;
        const token = {
            isCancellationRequested: false,
            onCancellationRequested: () => ({
                dispose() {
                    disposed = true;
                },
            }),
        };
        const client = new PythonSetupCliClient(
            () => "/fake/databricks",
            () => ({}),
            fakeSpawn({stdout: JSON.stringify(SUCCESS_DEFAULT)})
        );
        const result = await client.run(inv, {cwd: "/proj", token});
        expect(result.ok).to.equal(true);
        expect(disposed).to.equal(true);
    });

    it("does not let a throwing terminator escape cancellation", async () => {
        const {token} = nextTickToken();
        const client = new PythonSetupCliClient(
            () => "/fake/databricks",
            () => ({}),
            hangingSpawn,
            (child) => {
                // Emit close so the promise still settles, then throw.
                child.kill();
                throw new Error("kill failed");
            }
        );
        // Must reject cleanly (as a cancellation), not blow up synchronously.
        let caught: unknown;
        await client.run(inv, {cwd: "/proj", token}).catch((e) => (caught = e));
        expect(caught).to.be.instanceOf(PythonSetupCancelledError);
    });
});
