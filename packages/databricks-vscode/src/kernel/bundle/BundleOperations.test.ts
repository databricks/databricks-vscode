import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CancelledError } from "../../platform/errors";
import { noFileSearch } from "../../platform/fileSearch";
import { Log } from "../../platform/log";
import { nodeProcessRunner, type RunOptions, type RunResult } from "../../platform/process";
import { MutableState, when } from "../../platform/reactive";
import { StateStore } from "../../platform/state";
import { fakeCli, FakeProcessRunner } from "../../test-support/fakeCli";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { fakeLog, fakeMemento } from "../../test-support/fakes";
import { useTempDirs } from "../../test-support/tempDir";
import { Cli, CliError } from "../cli/Cli";
import type { Connection, ConnectionState } from "../connection/ConnectionService";
import { ProjectService } from "../project/ProjectService";
import { BundleLog, type BundleLogChannel } from "./BundleLog";
import { BundleService } from "./BundleService";

const tempDir = useTempDirs();
const FIXTURES = path.join(__dirname, "..", "cli", "commands", "fixtures", "bundle");
const fixture = (name: string) => fs.readFileSync(path.join(FIXTURES, name), "utf-8");
const HOST = "https://mock.databricks.test";
const BUNDLE = `bundle: {name: demo}\ntargets:\n  dev_test: {default: true, mode: development, workspace: {host: ${HOST}}}\n`;

function connected(): ConnectionState {
    const connection = {
        host: HOST,
        profile: "DEFAULT",
        authType: "pat",
        userName: "e2e@example.com",
        source: { kind: "onlyForHost", host: HOST },
        api: {},
        child: { kind: "profile", host: HOST, profile: "DEFAULT", authType: "pat" },
    } as unknown as Connection;
    return { status: "connected", connection };
}

function recordingChannel(): BundleLogChannel & { lines: string[] } {
    const lines: string[] = [];
    const push = (prefix: string) => (m: string) => lines.push(`${prefix}${m}`);
    return {
        lines,
        trace: push(""),
        debug: push(""),
        info: push(""),
        warn: push("warn: "),
        error: push("error: "),
        show: () => {},
        dispose: () => {},
    };
}

/** A promise and the functions that settle it. */
function deferred<T = void>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
}

/** Resolves when the run is aborted, as a killed process does. */
function untilAborted(options: RunOptions): Promise<Partial<RunResult>> {
    // As the real runner: a signal aborted before the start cancels at once.
    return new Promise((resolve) => {
        if (options.signal?.aborted) {
            resolve({ cancelled: true, exitCode: null });
            return;
        }
        options.signal?.addEventListener("abort", () =>
            resolve({ cancelled: true, exitCode: null }),
        );
    });
}

/** The real project detection and bundle service over a temp folder and a scripted CLI. */
function setup(
    options: {
        cli?: Cli;
        runner?: FakeProcessRunner;
        /** Runs before each bundle call's environment, as the target check does. */
        check?: () => Promise<void>;
    } = {},
) {
    const t = tempDir();
    t.write("databricks.yml", BUNDLE);
    t.write(
        ".databricks/bundle/dev_test/vscode.bundlevars.json",
        JSON.stringify({ greeting: "salut" }),
    );
    const runner = options.runner ?? new FakeProcessRunner();
    runner.on(["bundle", "validate"], { stdout: fixture("job.dev_test.validate.json") });
    runner.on(["bundle", "summary"], { stdout: fixture("job.dev_test.summary.json") });
    const cli = options.cli ?? fakeCli(runner).cli;
    const files = new FakeFileEvents();
    const project = new ProjectService({
        folders: new MutableState<readonly string[]>([t.dir]),
        files,
        search: noFileSearch,
        state: new StateStore({ global: fakeMemento(), workspace: fakeMemento() }),
        log: fakeLog(),
        debounceMs: 20,
    });
    const connection = new MutableState<ConnectionState>(
        { status: "connecting" },
        (a, b) => a === b,
    );
    const channel = recordingChannel();
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
        bundleLog: new BundleLog(() => channel),
        debounceMs: 5,
    });
    const operations = service.operations;
    const bundleCalls = () => runner.argv.filter((a) => a[0] === "bundle").map((a) => a[1]);
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
    /**
     * Connected, validated and summarized, with the log emptied. `initial` is the CLI calls to
     * wait for first; `[]` when no CLI answers (the fake runner records nothing).
     */
    const ready = async (initial = ["validate", "summary"]) => {
        project.start();
        service.start();
        await when(project.initialized, (i) => i);
        connection.set(connected());
        await settleUntil(() => expect(bundleCalls()).toEqual(initial));
        channel.lines.length = 0;
        runner.calls.length = 0;
    };
    return {
        t,
        runner,
        files,
        project,
        connection,
        service,
        operations,
        channel,
        bundleCalls,
        settle,
        settleUntil,
        ready,
    };
}

describe("BundleOperations", () => {
    it("starts no bundle command whose target check refuses, deploy or run", async () => {
        let refuse = false;
        const s = setup({
            check: async () => {
                if (refuse) {
                    throw new Error("paused in this session window");
                }
            },
        });
        await s.ready();
        const on = await s.operations.deploy();
        const calls = (verb: string) => s.runner.calls.filter((c) => c.args[1] === verb).length;
        refuse = true;
        const [deploys, runs] = [calls("deploy"), calls("run")];
        await expect(s.operations.deploy()).rejects.toThrow("paused in this session window");
        await expect(s.operations.run(on, "jobs.etl")).rejects.toThrow(
            "paused in this session window",
        );
        expect([calls("deploy"), calls("run")]).toEqual([deploys, runs]);
        s.service.dispose();
    });

    it("deploys with --verbose, streams the CLI's output, then refreshes the deployed state", async () => {
        const s = setup();
        await s.ready();
        s.runner.on(["bundle", "deploy"], (_args, options) => {
            options.onStderr?.("Uploading bundle files...\n");
            options.onStdout?.("Deployment complete!\n");
            return {};
        });

        await s.operations.deploy();

        const deploy = s.runner.calls.find((c) => c.args[1] === "deploy")!;
        expect(deploy.args).toEqual(["bundle", "deploy", "--target", "dev_test", "--verbose"]);
        expect(deploy.options.cwd).toBe(s.t.dir);
        expect(deploy.options.env).toEqual({
            DATABRICKS_CONFIG_PROFILE: "DEFAULT",
            BUNDLE_VAR_greeting: "salut",
        });
        expect(s.bundleCalls()).toEqual(["deploy", "summary"]);
        // The summary after an operation doesn't pull: the CLI just wrote the state.
        expect(s.runner.argv[1]).not.toContain("--force-pull");
        expect(s.channel.lines).toEqual([
            "Deploying the bundle for target dev_test...",
            "Uploading bundle files...",
            "Deployment complete!",
            "Bundle deployed successfully.",
            "Refreshing bundle configuration for target dev_test...",
            "Bundle configuration refreshed.",
        ]);
        expect(s.operations.busy.value).toBe(false);
        s.service.dispose();
    });

    it("deploys with DATABRICKS_CLUSTER_ID, and logs it, while the cluster override is checked (COMP-06)", async () => {
        const s = setup();
        await s.ready();
        await s.project.saveOverrides({ clusterId: "c-1", useClusterOverride: true });
        await s.settleUntil(() => expect(s.bundleCalls()).toEqual(["validate"]));
        s.channel.lines.length = 0;

        await s.operations.deploy();

        const deploy = s.runner.calls.find((c) => c.args[1] === "deploy")!;
        expect(deploy.options.env).toMatchObject({ DATABRICKS_CLUSTER_ID: "c-1" });
        expect(s.channel.lines.slice(0, 2)).toEqual([
            "Deploying the bundle for target dev_test...",
            "DATABRICKS_CLUSTER_ID=c-1",
        ]);
        s.service.dispose();
    });

    it("destroys with --auto-approve, and writes the old lines", async () => {
        const s = setup();
        await s.ready();
        await s.operations.destroy();
        expect(s.runner.argv[0]).toEqual([
            "bundle",
            "destroy",
            "--target",
            "dev_test",
            "--auto-approve",
        ]);
        expect(s.channel.lines).toEqual([
            "Destroying the bundle for target dev_test...",
            "Bundle destroyed successfully.",
            "Refreshing bundle configuration for target dev_test...",
            "Bundle configuration refreshed.",
        ]);
        s.service.dispose();
    });

    it("forces with --force-lock, and --force for deploy", async () => {
        const s = setup();
        await s.ready();
        await s.operations.deploy({ force: true });
        await s.operations.destroy({ force: true });
        const ops = s.runner.argv.filter((a) => a[1] !== "summary");
        expect(ops).toEqual([
            ["bundle", "deploy", "--target", "dev_test", "--verbose", "--force-lock", "--force"],
            ["bundle", "destroy", "--target", "dev_test", "--auto-approve", "--force-lock"],
        ]);
        s.service.dispose();
    });

    it("runs operations one at a time, in order, and is busy until the queue is empty", async () => {
        const s = setup();
        await s.ready();
        const gate = deferred();
        const events: string[] = [];
        s.runner.on(["bundle", "deploy"], async () => {
            events.push("deploy started");
            await gate.promise;
            events.push("deploy ended");
            return {};
        });
        s.runner.on(["bundle", "destroy"], () => {
            events.push("destroy started");
            return {};
        });
        const busy: boolean[] = [];
        s.operations.busy.onDidChange((b) => busy.push(b));

        const first = s.operations.deploy();
        const second = s.operations.destroy();
        expect(s.operations.busy.value).toBe(true);
        await vi.waitFor(() => expect(events).toEqual(["deploy started"]));

        gate.resolve();
        await Promise.all([first, second]);
        expect(events).toEqual(["deploy started", "deploy ended", "destroy started"]);
        expect(busy).toEqual([true, false]);
        s.service.dispose();
    });

    it("starts no summary while an operation runs, and one when it ends", async () => {
        const s = setup();
        await s.ready();
        const gate = deferred();
        s.runner.on(["bundle", "deploy"], async () => {
            await gate.promise;
            return {};
        });
        const running = s.operations.deploy();
        await vi.waitFor(() => expect(s.bundleCalls()).toEqual(["deploy"]));

        // A save during the deploy validates, and its changed output would summarize.
        s.runner.on(["bundle", "validate"], { stdout: fixture("pipeline.dev_test.validate.json") });
        s.t.write("databricks.yml", BUNDLE.replace("name: demo", "name: edited"));
        s.files.touch(s.t.path("databricks.yml"));
        await s.project.settled();
        // The validate comes after the debounce, later than settle's pause on a busy machine.
        await vi.waitFor(() => expect(s.bundleCalls()).toEqual(["deploy", "validate"]));
        await s.settle();
        // The explorer keeps its snapshot meanwhile.
        expect(s.service.deployed.value.status).toBe("ready");

        gate.resolve();
        await running;
        expect(s.bundleCalls()).toEqual(["deploy", "validate", "summary"]);
        s.service.dispose();
    });

    it("waits for a summary in flight before it starts", async () => {
        const s = setup();
        await s.ready();
        const gate = deferred();
        const events: string[] = [];
        s.runner.on(["bundle", "summary"], async () => {
            events.push("summary");
            await gate.promise;
            return { stdout: fixture("job.dev_test.summary.json") };
        });
        s.runner.on(["bundle", "deploy"], () => {
            events.push("deploy");
            return {};
        });
        s.service.deployed.invalidate("test");
        const running = s.operations.deploy();
        await vi.waitFor(() => expect(events).toEqual(["summary"]));
        gate.resolve();
        await running;
        expect(events).toEqual(["summary", "deploy", "summary"]);
        s.service.dispose();
    });

    it("refreshes after a failure too, and rejects with the CLI's error", async () => {
        const s = setup();
        await s.ready();
        s.runner.on(["bundle", "deploy"], { exitCode: 1, stderr: "Error: deploy failed\n" });
        await expect(s.operations.deploy()).rejects.toBeInstanceOf(CliError);
        expect(s.bundleCalls()).toEqual(["deploy", "summary"]);
        expect(s.channel.lines).toEqual([
            "Deploying the bundle for target dev_test...",
            "error: Failed to deploy the bundle.",
            "Refreshing bundle configuration for target dev_test...",
            "Bundle configuration refreshed.",
        ]);
        expect(s.operations.busy.value).toBe(false);
        s.service.dispose();
    });

    it("cancels: aborts the running CLI, and drops a queued operation without starting it", async () => {
        const s = setup();
        await s.ready();
        let deploySignal: AbortSignal | undefined;
        s.runner.on(["bundle", "deploy"], (_args, options) => {
            deploySignal = options.signal;
            return untilAborted(options);
        });
        const first = new AbortController();
        const second = new AbortController();
        const deploying = s.operations.deploy({ signal: first.signal });
        const destroying = s.operations.destroy({ signal: second.signal });
        await vi.waitFor(() => expect(s.bundleCalls()).toEqual(["deploy"]));

        second.abort();
        first.abort();
        await expect(deploying).rejects.toBeInstanceOf(CancelledError);
        await expect(destroying).rejects.toBeInstanceOf(CancelledError);
        expect(deploySignal?.aborted).toBe(true);
        expect(s.bundleCalls()).toEqual(["deploy", "summary"]);
        expect(s.channel.lines).toContain("warn: Failed to deploy the bundle. Reason: Cancelled");
        expect(s.channel.lines).not.toContain("Destroying the bundle for target dev_test...");
        expect(s.operations.busy.value).toBe(false);
        s.service.dispose();
    });

    it("uploads once with bundle sync --output text, writes the old lines, and refreshes nothing (RUN-01)", async () => {
        const s = setup();
        await s.ready();
        const on = await s.operations.syncOnce();
        expect(on).toMatchObject({
            root: s.t.dir,
            target: "dev_test",
            variables: { greeting: "salut" },
        });
        const [call] = s.runner.calls;
        expect(call!.args).toEqual(["bundle", "sync", "--target", "dev_test", "--output", "text"]);
        expect(call!.options).toMatchObject({
            cwd: s.t.dir,
            env: { DATABRICKS_CONFIG_PROFILE: "DEFAULT", BUNDLE_VAR_greeting: "salut" },
        });
        await s.settle();
        expect(s.bundleCalls()).toEqual(["sync"]);
        expect(s.channel.lines).toEqual([
            `Uploading bundle assets for target dev_test...`,
            "Bundle assets uploaded successfully.",
        ]);
        s.service.dispose();
    });

    it("queues the upload behind a deploy, and cancels it with the CLI killed", async () => {
        const s = setup();
        await s.ready();
        const gate = deferred();
        s.runner.on(["bundle", "deploy"], async () => {
            await gate.promise;
            return {};
        });
        let syncSignal: AbortSignal | undefined;
        s.runner.on(["bundle", "sync"], (_args, options) => {
            syncSignal = options.signal;
            return untilAborted(options);
        });
        const deploying = s.operations.deploy();
        const controller = new AbortController();
        const syncing = s.operations.syncOnce({ signal: controller.signal });
        await vi.waitFor(() => expect(s.bundleCalls()).toEqual(["deploy"]));

        gate.resolve();
        await deploying;
        await vi.waitFor(() => expect(syncSignal).toBeDefined());
        expect(s.operations.busy.value).toBe(true);
        controller.abort();
        await expect(syncing).rejects.toBeInstanceOf(CancelledError);
        expect(syncSignal?.aborted).toBe(true);
        expect(s.channel.lines).toContain(
            "warn: Failed to upload bundle assets. Reason: Cancelled",
        );
        expect(s.operations.busy.value).toBe(false);
        s.service.dispose();
    });

    it("rejects a failed upload with the CLI's error", async () => {
        const s = setup();
        await s.ready();
        s.runner.on(["bundle", "sync"], { exitCode: 1, stderr: "Error: no permission\n" });
        await expect(s.operations.syncOnce()).rejects.toThrow("Error: no permission");
        expect(s.channel.lines).toContain("error: Failed to upload bundle assets.");
        s.service.dispose();
    });

    it("drops a deploy cancelled while it waits behind a destroy, and stays busy until the destroy ends", async () => {
        const s = setup();
        await s.ready();
        const gate = deferred();
        s.runner.on(["bundle", "destroy"], async () => {
            await gate.promise;
            return {};
        });
        const busy: boolean[] = [];
        s.operations.busy.onDidChange((b) => busy.push(b));
        const destroying = s.operations.destroy();
        const cancel = new AbortController();
        const deploying = s.operations.deploy({ signal: cancel.signal });
        const deployOutcome = deploying.then(
            () => "deployed",
            (e: unknown) => (e instanceof CancelledError ? "cancelled" : `failed: ${String(e)}`),
        );
        await vi.waitFor(() => expect(s.bundleCalls()).toEqual(["destroy"]));
        cancel.abort();
        await new Promise((r) => setTimeout(r, 10));
        expect(s.operations.busy.value).toBe(true);

        gate.resolve();
        await destroying;
        expect(await deployOutcome).toBe("cancelled");
        expect(s.bundleCalls()).toEqual(["destroy", "summary"]);
        expect(s.channel.lines).toEqual([
            "Destroying the bundle for target dev_test...",
            "Bundle destroyed successfully.",
            "Refreshing bundle configuration for target dev_test...",
            "Bundle configuration refreshed.",
        ]);
        expect(busy).toEqual([true, false]);
        s.service.dispose();
    });

    it("runs two queued deploys one after the other, refreshing after each, and stays busy between them", async () => {
        const s = setup();
        await s.ready();
        const gate = deferred();
        let deploys = 0;
        s.runner.on(["bundle", "deploy"], async () => {
            deploys++;
            if (deploys === 1) {
                await gate.promise;
            }
            return {};
        });
        const busy: boolean[] = [];
        s.operations.busy.onDidChange((b) => busy.push(b));
        const first = s.operations.deploy();
        const second = s.operations.deploy();
        await vi.waitFor(() => expect(deploys).toBe(1));
        // The second must not start while the first holds the queue.
        await new Promise((r) => setTimeout(r, 10));
        expect(deploys).toBe(1);

        gate.resolve();
        await Promise.all([first, second]);
        expect(s.bundleCalls()).toEqual(["deploy", "summary", "deploy", "summary"]);
        expect(s.channel.lines).toEqual([
            "Deploying the bundle for target dev_test...",
            "Bundle deployed successfully.",
            "Refreshing bundle configuration for target dev_test...",
            "Bundle configuration refreshed.",
            "Deploying the bundle for target dev_test...",
            "Bundle deployed successfully.",
            "Refreshing bundle configuration for target dev_test...",
            "Bundle configuration refreshed.",
        ]);
        expect(busy).toEqual([true, false]);
        s.service.dispose();
    });

    it("logs why the CLI couldn't start, and isn't busy afterwards", async () => {
        const missing = path.join(tempDir().dir, "bin", "databricks");
        const s = setup({ cli: new Cli(nodeProcessRunner, () => missing, new Log([], "Test")) });
        // No CLI runs, so there are no calls to wait for.
        await s.ready([]);
        const reason = `The Databricks CLI wasn't found at ${missing}. Reinstall the extension.`;
        await expect(s.operations.deploy()).rejects.toThrow(reason);
        expect(s.channel.lines.slice(0, 2)).toEqual([
            "Deploying the bundle for target dev_test...",
            `error: Failed to deploy the bundle. ${reason}`,
        ]);
        expect(s.operations.busy.value).toBe(false);

        s.channel.lines.length = 0;
        await expect(s.operations.syncOnce()).rejects.toThrow(reason);
        expect(s.channel.lines).toEqual([
            "Uploading bundle assets for target dev_test...",
            `error: Failed to upload bundle assets. ${reason}`,
        ]);
        expect(s.operations.busy.value).toBe(false);
        s.service.dispose();
    });

    it("needs a connected target", async () => {
        const s = setup();
        s.project.start();
        s.service.start();
        await when(s.project.initialized, (i) => i);
        await expect(s.operations.deploy()).rejects.toThrow("No bundle target is connected.");
        expect(s.operations.busy.value).toBe(false);
        expect(s.bundleCalls()).toEqual([]);
        s.service.dispose();
    });

    it("kills the operation when disposed", async () => {
        const s = setup();
        await s.ready();
        s.runner.on(["bundle", "deploy"], (_args, options) => untilAborted(options));
        const deploying = s.operations.deploy();
        await vi.waitFor(() => expect(s.bundleCalls()).toEqual(["deploy"]));
        s.service.dispose();
        await expect(deploying).rejects.toBeInstanceOf(CancelledError);
    });

    it("runs a resource against what deploy deployed, with the variables, streaming its output", async () => {
        const s = setup();
        await s.ready();
        const on = await s.operations.deploy();
        expect(on).toMatchObject({
            root: s.t.dir,
            target: "dev_test",
            variables: { greeting: "salut" },
        });
        s.runner.on(["bundle", "run"], (_args, options) => {
            options.onStdout?.("Run URL: https://h/jobs/1/runs/2\n");
            options.onStderr?.("2026-10-03 12:00:00 RUNNING\n");
            return {};
        });
        const output: string[] = [];
        await s.operations.run(on, "jobs.etl", { onOutput: (c) => output.push(c) });

        const run = s.runner.calls.find((c) => c.args[1] === "run")!;
        expect(run.args).toEqual(["bundle", "run", "--target", "dev_test", "jobs.etl"]);
        expect(run.options.cwd).toBe(s.t.dir);
        expect(run.options.env).toMatchObject({
            DATABRICKS_CONFIG_PROFILE: "DEFAULT",
            BUNDLE_VAR_greeting: "salut",
        });
        expect(output).toEqual([
            "Run URL: https://h/jobs/1/runs/2\n",
            "2026-10-03 12:00:00 RUNNING\n",
        ]);
        s.service.dispose();
    });

    it("doesn't hold the queue or set busy while a run runs, and refreshes nothing after it", async () => {
        const s = setup();
        await s.ready();
        const on = await s.operations.deploy();
        s.runner.calls.length = 0;
        const running = deferred<Partial<RunResult>>();
        s.runner.on(["bundle", "run"], () => running.promise);
        const run = s.operations.run(on, "pipelines.p", { validateOnly: true });
        await vi.waitFor(() => expect(s.bundleCalls()).toEqual(["run"]));
        expect(s.operations.busy.value).toBe(false);

        // A deploy goes ahead meanwhile.
        await s.operations.deploy();
        running.resolve({});
        await run;
        await s.settle();
        expect(s.bundleCalls()).toEqual(["run", "deploy", "summary"]);
        expect(s.runner.argv[0]).toContain("--validate-only");
        s.service.dispose();
    });

    it("cancels a run: aborting kills the CLI, and disposing does too", async () => {
        const s = setup();
        await s.ready();
        const on = await s.operations.deploy();
        s.runner.on(["bundle", "run"], (_args, options) => untilAborted(options));
        const controller = new AbortController();
        const run = s.operations.run(on, "jobs.etl", { signal: controller.signal });
        controller.abort();
        await expect(run).rejects.toBeInstanceOf(CancelledError);

        const started = s.runner.calls.length;
        const second = s.operations.run(on, "jobs.etl");
        await vi.waitFor(() => expect(s.runner.calls.length).toBeGreaterThan(started));
        s.service.dispose();
        await expect(second).rejects.toBeInstanceOf(CancelledError);
        await expect(s.operations.run(on, "jobs.etl")).rejects.toBeInstanceOf(CancelledError);
    });

    it("rejects a failed run with the CLI's error", async () => {
        const s = setup();
        await s.ready();
        const on = await s.operations.deploy();
        s.runner.on(["bundle", "run"], { exitCode: 1, stderr: "Error: run failed" });
        await expect(s.operations.run(on, "jobs.etl")).rejects.toBeInstanceOf(CliError);
        s.service.dispose();
    });

    it.skipIf(process.platform === "win32")(
        "cancellation kills the CLI's process group, grandchildren included",
        async () => {
            const t = tempDir();
            const pidFile = t.path("grandchild.pid");
            // A stand-in CLI: validate and summary answer at once; deploy starts a
            // grandchild that would outlive a plain kill of its parent.
            const script = t.write(
                "databricks",
                [
                    "#!/bin/sh",
                    'case "$2" in',
                    `  validate) cat '${path.join(FIXTURES, "job.dev_test.validate.json")}' ;;`,
                    `  summary) cat '${path.join(FIXTURES, "job.dev_test.summary.json")}' ;;`,
                    `  deploy) sleep 30 & echo $! > '${pidFile}'; wait ;;`,
                    "esac",
                ].join("\n"),
            );
            fs.chmodSync(script, 0o755);
            const s = setup({ cli: new Cli(nodeProcessRunner, () => script, new Log([], "Test")) });
            // The stand-in CLI isn't the fake runner, so nothing is recorded to wait for.
            await s.ready([]);

            const controller = new AbortController();
            const deploying = s.operations.deploy({ signal: controller.signal });
            await expect
                .poll(
                    () => fs.existsSync(pidFile) && fs.readFileSync(pidFile, "utf-8").trim() !== "",
                    { timeout: 5000 },
                )
                .toBe(true);
            const grandchild = Number(fs.readFileSync(pidFile, "utf-8"));
            expect(isAlive(grandchild)).toBe(true);

            controller.abort();
            await expect(deploying).rejects.toBeInstanceOf(CancelledError);
            await expect.poll(() => isAlive(grandchild), { timeout: 5000 }).toBe(false);
            s.service.dispose();
        },
        15_000,
    ); // a real process, and two 5 s polls: past vitest's 5 s default on a busy machine
});

function isAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}
