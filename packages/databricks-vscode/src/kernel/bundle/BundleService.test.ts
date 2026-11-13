import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { noFileSearch } from "../../platform/fileSearch";
import { MutableState, when } from "../../platform/reactive";
import { StateStore } from "../../platform/state";
import { fakeCli, FakeProcessRunner } from "../../test-support/fakeCli";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { fakeLog, fakeMemento } from "../../test-support/fakes";
import { useTempDirs } from "../../test-support/tempDir";
import type { RunOptions, RunResult } from "../../platform/process";
import type { Connection, ConnectionState } from "../connection/ConnectionService";
import { ProjectService } from "../project/ProjectService";
import { BundleLog, type BundleLogChannel } from "./BundleLog";
import { BundleService } from "./BundleService";

const tempDir = useTempDirs();
const FIXTURES = path.join(__dirname, "..", "cli", "commands", "fixtures", "bundle");
const fixture = (name: string) => fs.readFileSync(path.join(FIXTURES, name), "utf-8");
const HOST = "https://mock.databricks.test";
const BUNDLE = `bundle: {name: demo}\ntargets:\n  dev_test: {default: true, workspace: {host: ${HOST}}}\n  dev_test2: {}\n`;

function connected(profile = "DEFAULT"): ConnectionState {
    const connection = {
        host: HOST,
        profile,
        authType: "pat",
        userName: "e2e@example.com",
        source: { kind: "onlyForHost", host: HOST },
        api: {},
        child: { kind: "profile", host: HOST, profile, authType: "pat" },
    } as unknown as Connection;
    return { status: "connected", connection };
}

/** A log channel that keeps its lines. */
function recordingChannel(): BundleLogChannel & { lines: string[]; created: number } {
    const lines: string[] = [];
    const channel = {
        lines,
        created: 0,
        trace: (m: string) => lines.push(m),
        debug: (m: string) => lines.push(m),
        info: (m: string) => lines.push(m),
        warn: (m: string) => lines.push(m),
        error: (m: string) => lines.push(`error: ${m}`),
        show: () => {},
        dispose: () => {},
    };
    return channel;
}

/**
 * The real project detection over a temp folder, a scripted CLI, and a
 * connection the test controls. Validate answers with the job fixture unless
 * a test scripts it otherwise.
 */
function setup(
    options: {
        runner?: FakeProcessRunner;
        content?: string;
        /** Runs before each bundle call's environment, as the target check does. */
        check?: () => Promise<void>;
    } = {},
) {
    const t = tempDir();
    t.write("databricks.yml", options.content ?? BUNDLE);
    const runner = options.runner ?? new FakeProcessRunner();
    runner.on(["bundle", "validate"], { stdout: fixture("job.dev_test.validate.json") });
    runner.on(["bundle", "summary"], { stdout: fixture("job.dev_test.summary.json") });
    const { cli } = fakeCli(runner);
    const files = new FakeFileEvents();
    const state = new StateStore({ global: fakeMemento(), workspace: fakeMemento() });
    const project = new ProjectService({
        folders: new MutableState<readonly string[]>([t.dir]),
        files,
        search: noFileSearch,
        state,
        log: fakeLog(),
        debounceMs: 20,
    });
    const connection = new MutableState<ConnectionState>(
        { status: "connecting" },
        (a, b) => a === b,
    );
    const channel = recordingChannel();
    const bundleLog = new BundleLog(() => {
        channel.created++;
        return channel;
    });
    const service = new BundleService({
        project: project.snapshot,
        connection,
        cli,
        choosesCompute: true,
        env: async (c, { variables, clusterId }) => {
            await options.check?.();
            return {
                DATABRICKS_CONFIG_PROFILE: c.profile ?? "",
                ...Object.fromEntries(
                    Object.entries(variables).map(([k, v]) => [`BUNDLE_VAR_${k}`, v]),
                ),
                ...(clusterId !== undefined ? { DATABRICKS_CLUSTER_ID: clusterId } : {}),
            };
        },
        log: fakeLog(),
        bundleLog,
        debounceMs: 5,
    });
    const bundleCalls = () =>
        runner.argv.filter((a) => a[0] === "bundle").map((a) => a.slice(0, 2).join(" "));
    const start = async () => {
        project.start();
        service.start();
        await when(project.initialized, (i) => i);
    };
    /** Waits until both stages have nothing scheduled or in flight. */
    const settle = async () => {
        await new Promise((r) => setTimeout(r, 30));
        await service.validated.settled();
        await service.deployed.settled();
    };
    /**
     * `settle`, then `check`, until `check` passes: a file or connection change reaches validate
     * through three debounce timers, which the Windows runner can wake ~16 ms late each.
     */
    const settleUntil = (check: () => void) =>
        vi.waitFor(async () => {
            await project.settled();
            await settle();
            check();
        });
    return {
        t,
        runner,
        files,
        project,
        connection,
        service,
        channel,
        bundleCalls,
        start,
        settle,
        settleUntil,
    };
}

describe("BundleService", () => {
    it("starts no validate or summary that the target check refuses", async () => {
        let refuse = false;
        const s = setup({
            check: async () => {
                if (refuse) {
                    throw new Error("paused in this session window");
                }
            },
        });
        await s.start();
        refuse = true;
        s.connection.set(connected());
        await s.settle();
        expect(s.bundleCalls()).toEqual([]);
    });

    it("validates and then summarizes once a project target is connected", async () => {
        const s = setup();
        await s.start();
        await s.settle();
        expect(s.bundleCalls()).toEqual([]);
        expect(s.channel.created).toBe(1);

        s.connection.set(connected());
        await s.settleUntil(() =>
            expect(s.runner.argv.filter((a) => a[0] === "bundle")).toEqual([
                ["bundle", "validate", "--target", "dev_test", "--output", "json"],
                [
                    "bundle",
                    "summary",
                    "--target",
                    "dev_test",
                    "--include-locations",
                    "--output",
                    "json",
                ],
            ]),
        );
        const call = s.runner.calls.find((c) => c.args[1] === "validate")!;
        expect(call.options.cwd).toBe(s.t.dir);
        expect(call.options.env).toEqual({ DATABRICKS_CONFIG_PROFILE: "DEFAULT" });
        expect(s.service.validated.value).toMatchObject({
            status: "ready",
            value: { root: s.t.dir, target: "dev_test", host: HOST },
        });
        expect(s.service.deployed.latest?.summary.resources?.jobs).toHaveProperty(
            "vscode_integration_test",
        );
        expect(s.channel.lines).toEqual([
            "Reading local bundle configuration for target dev_test...",
            "Finished reading local bundle configuration.",
            "Refreshing bundle configuration for target dev_test...",
            "Bundle configuration refreshed.",
        ]);
    });

    it("validates again with BUNDLE_VAR_* when the variable overrides change, and not when they don't", async () => {
        const s = setup();
        await s.start();
        s.connection.set(connected());
        await s.settleUntil(() =>
            expect(s.bundleCalls()).toEqual(["bundle validate", "bundle summary"]),
        );
        const before = s.bundleCalls().length;

        const file = s.t.write(
            ".databricks/bundle/dev_test/vscode.bundlevars.json",
            JSON.stringify({ greeting: "salut" }),
        );
        await s.project.reloadTargetFiles();
        await s.settleUntil(() =>
            expect(s.bundleCalls().slice(before)).toEqual(["bundle validate"]),
        );
        const validate = s.runner.calls.filter((c) => c.args[1] === "validate").at(-1)!;
        expect(validate.options.env).toEqual({
            DATABRICKS_CONFIG_PROFILE: "DEFAULT",
            BUNDLE_VAR_greeting: "salut",
        });

        // Rewritten with the same values: nothing to validate.
        fs.writeFileSync(file, JSON.stringify({ greeting: "salut" }, null, 4));
        await s.project.reloadTargetFiles();
        await s.settle();
        expect(s.bundleCalls().slice(before)).toEqual(["bundle validate"]);

        await s.project.resetVariables();
        await s.settleUntil(() =>
            expect(s.bundleCalls().slice(before)).toEqual(["bundle validate", "bundle validate"]),
        );
        expect(s.runner.calls.filter((c) => c.args[1] === "validate").at(-1)!.options.env).toEqual({
            DATABRICKS_CONFIG_PROFILE: "DEFAULT",
        });
        // Validate never writes the variables file.
        expect(fs.existsSync(file)).toBe(false);
    });

    it("validates again with DATABRICKS_CLUSTER_ID while the cluster override is checked (COMP-06)", async () => {
        const s = setup();
        await s.start();
        s.connection.set(connected());
        await s.settleUntil(() =>
            expect(s.bundleCalls()).toEqual(["bundle validate", "bundle summary"]),
        );
        const before = s.bundleCalls().length;
        const validates = () => s.runner.calls.filter((c) => c.args[1] === "validate");

        // Attached, not checked: nothing changes for the CLI.
        await s.project.saveOverrides({ clusterId: "c-1" });
        await s.settle();
        expect(s.bundleCalls().slice(before)).toEqual([]);

        await s.project.saveOverrides({ useClusterOverride: true });
        await s.settleUntil(() =>
            expect(s.bundleCalls().slice(before)).toEqual(["bundle validate"]),
        );
        expect(validates().at(-1)!.options.env).toEqual({
            DATABRICKS_CONFIG_PROFILE: "DEFAULT",
            DATABRICKS_CLUSTER_ID: "c-1",
        });

        // Detached: the bundle's own cluster again.
        await s.project.saveOverrides({ clusterId: undefined });
        await s.settleUntil(() =>
            expect(s.bundleCalls().slice(before)).toEqual(["bundle validate", "bundle validate"]),
        );
        expect(validates().at(-1)!.options.env).toEqual({ DATABRICKS_CONFIG_PROFILE: "DEFAULT" });
    });

    it("starts at most two processes for a burst of five saves", async () => {
        const s = setup();
        await s.start();
        s.connection.set(connected());
        await s.settleUntil(() =>
            expect(s.bundleCalls()).toEqual(["bundle validate", "bundle summary"]),
        );
        const before = s.bundleCalls().length;
        for (let i = 0; i < 5; i++) {
            s.t.write(
                "databricks.yml",
                `${BUNDLE}# save ${i}\nvariables: {v: {default: "${i}"}}\n`,
            );
            s.files.touch(s.t.path("databricks.yml"));
            await new Promise((r) => setTimeout(r, 2));
        }
        // validate output is the same fixture, so only validate reruns here.
        await s.settleUntil(() =>
            expect(s.bundleCalls().slice(before)).toEqual(["bundle validate"]),
        );
    });

    it("summarizes again only when validate's output changes", async () => {
        const runner = new FakeProcessRunner();
        const s = setup({ runner });
        await s.start();
        s.connection.set(connected());
        await s.settleUntil(() =>
            expect(s.bundleCalls()).toEqual(["bundle validate", "bundle summary"]),
        );

        runner.on(["bundle", "validate"], { stdout: fixture("variables.dev_test.validate.json") });
        s.t.write("databricks.yml", `${BUNDLE}# edited\nvariables: {catalog: {default: main}}\n`);
        s.files.touch(s.t.path("databricks.yml"));
        await s.settleUntil(() =>
            expect(s.bundleCalls()).toEqual([
                "bundle validate",
                "bundle summary",
                "bundle validate",
                "bundle summary",
            ]),
        );
    });

    it("aborts a validate that a newer change supersedes", async () => {
        const runner = new FakeProcessRunner();
        const signals: AbortSignal[] = [];
        const s = setup({ runner });
        runner.on(["bundle", "validate"], (_args: string[], options: RunOptions) => {
            signals.push(options.signal!);
            return new Promise((resolve) => {
                const done = () => resolve({ cancelled: options.signal!.aborted, exitCode: null });
                options.signal!.addEventListener("abort", done);
                // The second validate answers at once.
                if (signals.length > 1) {
                    resolve({ stdout: fixture("job.dev_test.validate.json") });
                }
            });
        });
        await s.start();
        s.connection.set(connected());
        await vi.waitFor(() => expect(signals).toHaveLength(1));
        s.connection.set(connected("OTHER"));
        await s.settleUntil(() => expect(signals).toHaveLength(2));
        expect(signals[0]!.aborted).toBe(true);
        expect(s.service.validated.value.status).toBe("ready");
        expect(s.runner.calls.filter((c) => c.args[1] === "validate").at(-1)?.options.env).toEqual({
            DATABRICKS_CONFIG_PROFILE: "OTHER",
        });
    });

    it("never starts a process when read", async () => {
        const s = setup();
        await s.start();
        s.connection.set(connected());
        await s.settleUntil(() =>
            expect(s.bundleCalls()).toEqual(["bundle validate", "bundle summary"]),
        );
        const count = s.runner.calls.length;
        void s.service.validated.value;
        void s.service.deployed.latest;
        await s.service.validated.settled();
        await s.service.deployed.settled();
        expect(s.runner.calls.length).toBe(count);
    });

    it("forces a summary with --force-pull on an explicit refresh, even if nothing changed", async () => {
        const s = setup();
        await s.start();
        s.connection.set(connected());
        await s.settleUntil(() =>
            expect(s.bundleCalls()).toEqual(["bundle validate", "bundle summary"]),
        );
        await s.service.refreshRemoteState({ forcePull: true });
        expect(s.runner.argv.filter((a) => a[0] === "bundle").slice(2)).toEqual([
            ["bundle", "validate", "--target", "dev_test", "--output", "json"],
            [
                "bundle",
                "summary",
                "--target",
                "dev_test",
                "--include-locations",
                "--output",
                "json",
                "--force-pull",
            ],
        ]);
    });

    it("reports a failed refresh, and logs the failure", async () => {
        const runner = new FakeProcessRunner();
        const s = setup({ runner });
        await s.start();
        s.connection.set(connected());
        await s.settleUntil(() =>
            expect(s.bundleCalls()).toEqual(["bundle validate", "bundle summary"]),
        );
        runner.on(["bundle", "summary"], { exitCode: 1, stderr: "Error: boom" });
        await expect(s.service.refreshRemoteState({ forcePull: true })).rejects.toThrow(
            "Error: boom",
        );
        expect(s.channel.lines.at(-1)).toBe("error: Failed to refresh bundle configuration.");
        // The last good summary stays readable.
        expect(s.service.deployed.latest?.summary.resources?.jobs).toBeDefined();
    });

    it("validates the new target when it changes, without showing the old one's results", async () => {
        const s = setup();
        await s.start();
        s.connection.set(connected());
        await s.settleUntil(() =>
            expect(s.bundleCalls()).toEqual(["bundle validate", "bundle summary"]),
        );
        const seen: string[] = [];
        s.service.deployed.onDidChange((st) => seen.push(st.status));
        await s.project.selectTarget("dev_test2");
        expect(s.service.deployed.latest).toBeUndefined();
        await s.settleUntil(() =>
            expect(s.runner.argv.filter((a) => a[1] === "validate").at(-1)).toContain("dev_test2"),
        );
        expect(seen[0]).toBe("idle");
    });

    it("clears both results when signed out, and keeps them while reconnecting", async () => {
        const s = setup();
        await s.start();
        s.connection.set(connected());
        await s.settleUntil(() => expect(s.service.deployed.latest).toBeDefined());
        s.connection.set({ status: "connecting" });
        expect(s.service.deployed.latest).toBeDefined();
        s.connection.set({ status: "signedOut", reason: "You signed out." });
        expect(s.service.validated.value).toEqual({ status: "idle" });
        expect(s.service.deployed.value).toEqual({ status: "idle" });
    });

    describe("when validate fails", () => {
        const cases: {
            name: string;
            result: Partial<RunResult>;
            stderr?: string;
            logged: string[];
        }[] = [
            {
                name: "exit 1 with valid JSON on stdout",
                result: { exitCode: 1, stdout: fixture("job.dev_test.validate.json") },
                stderr: "Error: job vscode_integration_test has no tasks\n",
                logged: [
                    "Error: job vscode_integration_test has no tasks",
                    "error: Failed to read local bundle configuration.",
                ],
            },
            {
                name: "warnings on stderr and truncated JSON on stdout",
                result: { stdout: fixture("job.dev_test.validate.json").slice(0, 200) },
                stderr: "Warning: unknown field: foo\n  at targets.dev_test\n",
                logged: [
                    "Warning: unknown field: foo",
                    "  at targets.dev_test",
                    "error: Failed to read local bundle configuration. Can't parse the output of databricks bundle validate",
                ],
            },
            {
                name: "empty stdout and exit 0",
                result: { stdout: "" },
                logged: [
                    "error: Failed to read local bundle configuration. Can't parse the output of databricks bundle validate",
                ],
            },
            {
                name: "an auth error",
                result: { exitCode: 1 },
                stderr: "Error: cannot get access token: default auth: cannot configure default credentials. 401 Unauthorized\n",
                logged: [
                    "Error: cannot get access token: default auth: cannot configure default credentials. 401 Unauthorized",
                    "error: Failed to read local bundle configuration.",
                ],
            },
        ];

        it.each(cases)(
            "$name: logs why, keeps no config, and still shows the deployed resources",
            async ({ result, stderr, logged }) => {
                const runner = new FakeProcessRunner();
                const s = setup({ runner });
                runner.on(["bundle", "validate"], (_a: string[], options: RunOptions) => {
                    if (stderr !== undefined) {
                        options.onStderr?.(stderr);
                    }
                    return { ...result, stderr: stderr ?? "" };
                });
                await s.start();
                s.connection.set(connected());
                await s.settleUntil(() => {
                    expect(s.channel.lines.slice(0, logged.length + 1)).toEqual([
                        "Reading local bundle configuration for target dev_test...",
                        ...logged,
                    ]);
                    expect(s.bundleCalls()).toEqual(["bundle validate", "bundle summary"]);
                });
                expect(s.channel.lines).not.toContain(
                    "Finished reading local bundle configuration.",
                );
                expect(s.service.validated.value.status).toBe("error");
                expect(s.service.validated.latest).toBeUndefined();
                // As before, the deployed state is read on its own.
                expect(s.service.deployed.latest?.summary.resources?.jobs).toHaveProperty(
                    "vscode_integration_test",
                );
            },
        );

        it("keeps the last good config when a later validate fails, and refreshes report the failure", async () => {
            const runner = new FakeProcessRunner();
            const s = setup({ runner });
            await s.start();
            s.connection.set(connected());
            await s.settleUntil(() =>
                expect(s.bundleCalls()).toEqual(["bundle validate", "bundle summary"]),
            );
            runner.on(["bundle", "validate"], { exitCode: 1, stderr: "Error: boom" });
            await expect(s.service.refreshRemoteState({ forcePull: true })).rejects.toThrow(
                "Error: boom",
            );
            expect(s.service.validated.value.status).toBe("error");
            expect(s.service.validated.latest?.config.workspace?.file_path).toBe(
                JSON.parse(fixture("job.dev_test.validate.json")).workspace.file_path,
            );
        });
    });

    describe("after a target switch", () => {
        /** Answers the first call for `dev_test` only when released, whatever happens meanwhile, as a process that exits just as it's killed. */
        function late(runner: FakeProcessRunner, command: string, stdout: string) {
            let release!: () => void;
            const released = new Promise<void>((r) => (release = r));
            let held = false;
            runner.on(["bundle", command, "--target", "dev_test"], async () => {
                if (held) {
                    return { stdout };
                }
                held = true;
                await released;
                return { stdout };
            });
            return release;
        }

        it("drops a validate of the old target that answers late", async () => {
            const runner = new FakeProcessRunner();
            const s = setup({ runner });
            runner.on(["bundle", "validate", "--target", "dev_test2"], {
                stdout: fixture("two-targets.dev_test2.validate.json"),
            });
            runner.on(["bundle", "summary", "--target", "dev_test2"], {
                stdout: fixture("two-targets.dev_test2.summary.json"),
            });
            const release = late(runner, "validate", fixture("job.dev_test.validate.json"));
            await s.start();
            s.connection.set(connected());
            // The old target's validate is under way, and held, when the target changes.
            await vi.waitFor(() =>
                expect(runner.argv.filter((a) => a[1] === "validate").map((a) => a[3])).toContain(
                    "dev_test",
                ),
            );
            await s.project.selectTarget("dev_test2");
            await s.settleUntil(() =>
                expect(runner.argv.filter((a) => a[1] === "summary").map((a) => a[3])).toEqual([
                    "dev_test2",
                ]),
            );
            release();
            await s.settle();
            expect(s.service.validated.value).toMatchObject({
                status: "ready",
                value: { target: "dev_test2" },
            });
            expect(s.service.validated.latest?.config.bundle?.target).toBe("dev_test2");
            expect(s.service.deployed.latest).toMatchObject({
                target: "dev_test2",
                summary: { bundle: { target: "dev_test2" } },
            });
            expect(runner.argv.filter((a) => a[1] === "summary").map((a) => a[3])).toEqual([
                "dev_test2",
            ]);
        });

        it("drops a summary of the old target that answers late", async () => {
            const runner = new FakeProcessRunner();
            const s = setup({ runner });
            runner.on(["bundle", "validate", "--target", "dev_test2"], {
                stdout: fixture("two-targets.dev_test2.validate.json"),
            });
            runner.on(["bundle", "summary", "--target", "dev_test2"], {
                stdout: fixture("two-targets.dev_test2.summary.json"),
            });
            const release = late(runner, "summary", fixture("job.dev_test.summary.json"));
            await s.start();
            s.connection.set(connected());
            // Held, so `settle` would wait on it: wait for the call itself.
            await vi.waitFor(() =>
                expect(runner.argv.filter((a) => a[1] === "summary").map((a) => a[3])).toEqual([
                    "dev_test",
                ]),
            );
            await s.project.selectTarget("dev_test2");
            // The new target's summary waits behind the held one, so only its validate can be awaited.
            await s.settleUntil(() => expect(s.service.validated.latest?.target).toBe("dev_test2"));
            release();
            await s.settleUntil(() =>
                expect(s.service.deployed.value).toMatchObject({
                    status: "ready",
                    value: { target: "dev_test2" },
                }),
            );
            expect(s.service.deployed.latest?.summary.bundle?.target).toBe("dev_test2");
            expect(s.service.deployed.latest?.summary).toMatchObject(
                JSON.parse(fixture("two-targets.dev_test2.summary.json")),
            );
        });

        it("finishes a deploy on the old target, then summarizes the new one", async () => {
            const runner = new FakeProcessRunner();
            const s = setup({ runner });
            runner.on(["bundle", "validate", "--target", "dev_test2"], {
                stdout: fixture("two-targets.dev_test2.validate.json"),
            });
            runner.on(["bundle", "summary", "--target", "dev_test2"], {
                stdout: fixture("two-targets.dev_test2.summary.json"),
            });
            let release!: () => void;
            const gate = new Promise<void>((r) => (release = r));
            runner.on(["bundle", "deploy"], async () => {
                await gate;
                return {};
            });
            await s.start();
            s.connection.set(connected());
            await s.settleUntil(() =>
                expect(s.bundleCalls()).toEqual(["bundle validate", "bundle summary"]),
            );
            s.channel.lines.length = 0;
            const deploying = s.service.operations.deploy();
            await vi.waitFor(() => expect(s.bundleCalls()).toContain("bundle deploy"));
            await s.project.selectTarget("dev_test2");
            await s.settleUntil(() => expect(s.service.validated.latest?.target).toBe("dev_test2"));
            // Nothing of the old target shows meanwhile, and no summary reads the state the deploy writes.
            expect(s.service.deployed.value).toEqual({ status: "idle" });

            release();
            expect((await deploying).target).toBe("dev_test");
            await s.settleUntil(() =>
                expect(
                    runner.argv
                        .filter((a) => a[0] === "bundle")
                        .slice(2)
                        .map((a) => `${a[1]} ${a[3]}`),
                ).toEqual(["deploy dev_test", "validate dev_test2", "summary dev_test2"]),
            );
            expect(s.service.deployed.latest).toMatchObject({
                target: "dev_test2",
                summary: { bundle: { target: "dev_test2" } },
            });
            expect(s.service.operations.busy.value).toBe(false);
            expect(s.channel.lines).toEqual([
                "Deploying the bundle for target dev_test...",
                "Reading local bundle configuration for target dev_test2...",
                "Finished reading local bundle configuration.",
                "Bundle deployed successfully.",
                "Refreshing bundle configuration for target dev_test2...",
                "Bundle configuration refreshed.",
            ]);
        });
    });

    it("streams the CLI's stderr into the bundle log", async () => {
        const runner = new FakeProcessRunner();
        const s = setup({ runner });
        runner.on(["bundle", "validate"], (_a: string[], options: RunOptions) => {
            options.onStderr?.("Warning: unknown field: foo\n");
            return { stdout: fixture("job.dev_test.validate.json") };
        });
        await s.start();
        s.connection.set(connected());
        await s.settleUntil(() => expect(s.channel.lines).toContain("Warning: unknown field: foo"));
    });
});
