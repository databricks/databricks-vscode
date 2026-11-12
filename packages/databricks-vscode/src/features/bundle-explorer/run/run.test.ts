import { beforeEach, describe, expect, it, vi } from "vitest";
import { TreeItemCollapsibleState } from "vscode";
import { registerFeatures, startFeatures } from "../../../kernel/feature";
import type { RunOptions, RunResult } from "../../../platform/process";
import { MutableState, when } from "../../../platform/reactive";
import { FAKE_CLI_PATH, fakeFeatureHost, fakeKernel, fakeLog } from "../../../test-support/fakes";
import { FakeFileEvents } from "../../../test-support/fakeFiles";
import { FakeHttpClient, SCIM_ME } from "../../../test-support/fakeHttp";
import { useTempDirs } from "../../../test-support/tempDir";
import { host as vscode } from "../../../test-support/vscode";
import { connection } from "../../connection";
import { configurationView } from "../../configuration-view";
import type { ConfigurationTreeDataProvider } from "../../configuration-view/ConfigurationTreeDataProvider";
import { PROJECT_VIEW } from "../../../kernel/project/commands";
import { NodeGroupSection } from "../../../platform/ui/nodeGroup";
import type { ConfigurationItem } from "../../../platform/ui/sections";
import type { TreeNode } from "../../../platform/ui/tree";
import { bundleExplorer } from "../index";
import {
    CANCEL_RUN,
    DEPLOY_AND_RUN_FROM_INPUT,
    DEPLOY_AND_RUN_JOB,
    DEPLOY_AND_RUN_PIPELINE,
    DEPLOY_AND_RUN_SELECTED_TABLES,
    DEPLOY_AND_VALIDATE_PIPELINE,
    SHOW_PIPELINE_EVENT_DETAILS,
} from "./RunCommands";

/* eslint-disable @typescript-eslint/naming-convention */

const A = "https://a.cloud.databricks.com";
const tempDir = useTempDirs();
const RUNS_GET = "/api/2.2/jobs/runs/get";
const RUNS_CANCEL = "/api/2.2/jobs/runs/cancel";
const UPDATE = "/api/2.0/pipelines/p-1/updates/u-1";
const EVENTS = "/api/2.0/pipelines/p-1/events";
const RUN_URL = `Run URL: ${A}/jobs/11/runs/931?o=1\n`;
const UPDATE_URL = `Update URL: ${A}/#joblist/pipelines/p-1/updates/u-1\n`;

const SUMMARY = JSON.stringify({
    bundle: { name: "demo", target: "dev", mode: "development" },
    workspace: { file_path: "/Workspace/Users/me/.bundle/demo/dev/files" },
    resources: {
        jobs: {
            etl: {
                id: "11",
                name: "[dev me] etl",
                tasks: [{ task_key: "nb", notebook_task: { notebook_path: "src/nb" } }],
            },
        },
        pipelines: { dlt: { id: "p-1", name: "[dev me] dlt" } },
    },
});

const jobRun = (life_cycle_state: string, result_state?: string) => ({
    body: {
        job_id: 11,
        run_id: 931,
        run_page_url: `${A}/jobs/11/runs/931`,
        start_time: 1759492800000,
        run_duration: 4000,
        state: { life_cycle_state, result_state },
        tasks: [
            {
                task_key: "nb",
                run_id: 932,
                state: { life_cycle_state, result_state },
                start_time: 1759492800000,
            },
        ],
    },
});

const update = (state: string, extra: Record<string, unknown> = {}) => ({
    body: {
        update: {
            pipeline_id: "p-1",
            update_id: "u-1",
            state,
            creation_time: 1759492800000,
            ...extra,
        },
    },
});

/** The frozen spec's events: a view, and a materialized view whose schema event has no type. */
const PIPELINE_EVENTS = {
    events: [
        {
            id: "e1",
            timestamp: "2026-10-03T12:00:01.000Z",
            message: "Dataset `test_view` defined as VIEW.",
            level: "INFO",
            origin: { update_id: "u-1", dataset_name: "test_view" },
            details: {
                dataset_definition: {
                    dataset_type: "VIEW",
                    schema: [{ name: "1", data_type: "INTEGER" }],
                },
            },
        },
        {
            id: "e2",
            timestamp: "2026-10-03T12:00:02.000Z",
            message: "Dataset `vscode_integration_test`.`test_table` defined as MATERIALIZED_VIEW.",
            level: "INFO",
            origin: { update_id: "u-1", dataset_name: "vscode_integration_test.test_table" },
            details: { dataset_definition: { dataset_type: "MATERIALIZED_VIEW" } },
        },
        {
            id: "e3",
            timestamp: "2026-10-03T12:00:03.000Z",
            message: "Flow 'vscode_integration_test.test_table' has COMPLETED.",
            level: "INFO",
            origin: { update_id: "u-1", dataset_name: "vscode_integration_test.test_table" },
            details: { dataset_definition: { schema: [{ name: "1", data_type: "INTEGER" }] } },
        },
    ],
};

/** Resolves when the run is aborted, as a killed process does. */
function untilAborted(options: RunOptions): Promise<Partial<RunResult>> {
    return new Promise((resolve) =>
        options.signal?.addEventListener("abort", () =>
            resolve({ cancelled: true, exitCode: null }),
        ),
    );
}

/** The real kernel, connected to a project with a job and a pipeline, and the explorer registered. */
async function setup() {
    const t = tempDir();
    const config = t.write(".databrickscfg", `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n`);
    t.write(
        "project/databricks.yml",
        `bundle: {name: demo}\ntargets:\n  dev: {default: true, mode: development, workspace: {host: ${A}}}\n  prod: {mode: development, workspace: {host: ${A}}}\n`,
    );
    const root = t.path("project");
    vscode.folders = [root];
    const http = new FakeHttpClient().on("GET", SCIM_ME, () => ({ body: { userName: "me" } }));
    const kernel = fakeKernel({
        env: { DATABRICKS_CONFIG_FILE: config },
        httpClient: http,
        folders: new MutableState<readonly string[]>([root]),
        files: new FakeFileEvents(),
    });
    kernel.runner.on(["bundle", "validate"], { stdout: SUMMARY });
    kernel.runner.on(["bundle", "summary"], { stdout: SUMMARY });
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures([connection, configurationView, bundleExplorer], fake.host);
    kernel.start();
    startFeatures(registered);
    await when(kernel.connection.state, (s) => s.status === "connected");
    await when(kernel.bundle.deployed, (s) => s.status === "ready");
    kernel.runner.calls.length = 0;
    // The rows of the Resources group in the Project view. A row is its own tree item here.
    const project = vscode.treeDataProviders.get(PROJECT_VIEW) as ConfigurationTreeDataProvider;
    const provider = {
        getChildren: async (parent?: ConfigurationItem) =>
            (await project.getChildren(parent)).map((row) =>
                Object.assign(row, { getTreeItem: () => row }),
            ),
    };
    const resource = async (header: string, name: string) => {
        const [group] = await provider.getChildren();
        const headers = await provider.getChildren(group);
        const children = await provider.getChildren(
            headers.find((r) => r.getTreeItem().label === header),
        );
        return children.find((c) => c.getTreeItem().label === name)!;
    };
    const job = () => resource("Jobs", "[dev me] etl");
    const pipeline = () => resource("Pipelines", "[dev me] dlt");
    const child = async (node: ConfigurationItem, label: string) =>
        (await provider.getChildren(node)).find((c) => c.getTreeItem().label === label);
    const labels = async (node: ConfigurationItem | undefined) =>
        (await provider.getChildren(node)).map((c) => [
            c.getTreeItem().label,
            c.getTreeItem().description,
        ]);
    const run = (command: string, ...args: unknown[]) => vscode.commands.get(command)?.(...args);
    const runs = () => kernel.runner.argv.filter((a) => a[1] === "run");
    return {
        kernel,
        http,
        provider,
        job,
        pipeline,
        child,
        labels,
        run,
        runs,
        reporter: fake.reporter,
        root,
    };
}

describe("deploy and run", () => {
    beforeEach(() => vscode.reset());

    it("deploys, runs the job in its terminal, and shows the run's and the tasks' status (BNDL-08)", async () => {
        const s = await setup();
        s.kernel.runner.on(["bundle", "run"], (_args, options) => {
            options.onStdout?.(RUN_URL);
            return {};
        });
        s.http.on("GET", RUNS_GET, jobRun("RUNNING"), jobRun("TERMINATED", "SUCCESS"));

        await s.run(DEPLOY_AND_RUN_JOB, await s.job());

        expect(
            s.kernel.runner.argv.map((a) => a[1]).filter((c) => c === "deploy" || c === "run"),
        ).toEqual(["deploy", "run"]);
        expect(s.runs()).toEqual([["bundle", "run", "--target", "dev", "jobs.etl"]]);
        const terminal = vscode.terminals.find((t) => t.name === "Run jobs.etl (dev)")!;
        expect(terminal.creationOptions.isTransient).toBe(true);
        expect(terminal.output).toContain(`${FAKE_CLI_PATH} bundle run --target dev jobs.etl\r\n`);
        expect(terminal.output).toContain(
            "Run URL: https://a.cloud.databricks.com/jobs/11/runs/931?o=1\r\n",
        );
        expect(terminal.output).toContain("Process completed successfully");

        const job = await s.job();
        const status = (await s.child(job, "Run Status"))!;
        expect(status.getTreeItem()).toMatchObject({
            description: "Success",
            contextValue: expect.stringContaining("has-url"),
        });
        expect(status.url).toBe(`${A}/jobs/11/runs/931`);
        expect((await s.labels(status)).map(([label]) => label)).toEqual([
            "Start Time",
            "Duration",
        ]);
        expect(job.getTreeItem().contextValue).toBe(
            "databricks.bundle.resource=jobs.runnable.has-url.nodeType=jobs",
        );
        const tasks = (await s.child(job, "Tasks"))!;
        const task = (await s.provider.getChildren(tasks))[0]!;
        expect(await s.labels(task)).toEqual([["Run Status", "Success"]]);
        expect((await s.provider.getChildren(task))[0]!.url).toBe(`${A}/#job/11/run/932`);
        expect(vscode.errors).toEqual([]);
        expect(s.reporter.events.find((e) => e.name === "bundleRun")?.properties).toMatchObject({
            "event.success": "true",
            "event.cancelled": "false",
            "event.resourceType": "jobs",
            "event.runType": "run",
        });
        s.kernel.dispose();
    });

    it("marks the job running and cancellable while it runs, and refuses a second run", async () => {
        const s = await setup();
        let release!: () => void;
        s.kernel.runner.on(["bundle", "run"], async (_args, options) => {
            options.onStdout?.(RUN_URL);
            await new Promise<void>((r) => (release = r));
            return {};
        });
        s.http.on(
            "GET",
            RUNS_GET,
            jobRun("RUNNING"),
            jobRun("RUNNING"),
            jobRun("TERMINATED", "SUCCESS"),
        );

        const running = s.run(DEPLOY_AND_RUN_JOB, await s.job());
        await expect
            .poll(
                async () => (await s.child(await s.job(), "Run Status"))?.getTreeItem().description,
            )
            .toBe("Running");
        expect((await s.job()).getTreeItem().contextValue).toBe(
            "databricks.bundle.resource=jobs.running.cancellable.has-url.nodeType=jobs",
        );

        await s.run(DEPLOY_AND_RUN_JOB, await s.job());
        expect(vscode.errors.map((e) => e.message)).toEqual([
            'A run for the "jobs.etl" is already in progress.',
        ]);
        expect(s.runs()).toHaveLength(1);

        release();
        await running;
        expect((await s.child(await s.job(), "Run Status"))?.getTreeItem().description).toBe(
            "Success",
        );
        s.kernel.dispose();
    });

    it("cancels: kills the CLI and cancels the remote run", async () => {
        const s = await setup();
        s.kernel.runner.on(["bundle", "run"], (_args, options) => {
            options.onStdout?.(RUN_URL);
            return untilAborted(options);
        });
        s.http.on(
            "GET",
            RUNS_GET,
            jobRun("RUNNING"),
            jobRun("RUNNING"),
            jobRun("TERMINATED", "CANCELED"),
        );
        s.http.on("POST", RUNS_CANCEL, { body: {} });

        const running = s.run(DEPLOY_AND_RUN_JOB, await s.job());
        await expect
            .poll(
                async () => (await s.child(await s.job(), "Run Status"))?.getTreeItem().description,
            )
            .toBe("Running");
        await s.run(CANCEL_RUN, await s.job());
        await running;

        expect(JSON.parse(s.http.to(RUNS_CANCEL)[0]!.body as string)).toEqual({ run_id: 931 });
        expect((await s.child(await s.job(), "Run Status"))?.getTreeItem().description).toBe(
            "Cancelled",
        );
        expect(vscode.terminals.at(-1)!.output).not.toContain("Process exited");
        expect(vscode.errors).toEqual([]);
        expect(s.reporter.events.find((e) => e.name === "bundleRun")?.properties).toMatchObject({
            "event.cancelled": "true",
        });
        s.kernel.dispose();
    });

    it("redraws only the job's own rows on each status poll, so its Cancel run button stays clickable", async () => {
        const s = await setup();
        s.kernel.runner.on(["bundle", "run"], (_args, options) => {
            options.onStdout?.(RUN_URL);
            return untilAborted(options);
        });
        let polls = 0;
        s.http.on("GET", RUNS_GET, () => {
            if (s.http.to(RUNS_CANCEL).length > 0) {
                return jobRun("TERMINATED", "CANCELED");
            }
            polls++;
            return jobRun("RUNNING");
        });
        s.http.on("POST", RUNS_CANCEL, { body: {} });
        const project = vscode.treeDataProviders.get(PROJECT_VIEW) as ConfigurationTreeDataProvider;

        const running = s.run(DEPLOY_AND_RUN_JOB, await s.job());
        await expect
            .poll(
                async () => (await s.child(await s.job(), "Run Status"))?.getTreeItem().description,
            )
            .toBe("Running");
        // The rows the view has now; a poll changes the run's status only.
        const row = await s.job();
        const refreshes: (ConfigurationItem | undefined)[] = [];
        project.onDidChangeTreeData((e) => refreshes.push(e));
        const seen = polls;
        await vi.waitFor(() => expect(polls).toBeGreaterThan(seen), { timeout: 5_000 });
        await vi.waitFor(() => expect(refreshes).not.toEqual([]));
        // The job's row itself, not the whole view: VS Code keeps the row while it redraws it.
        expect(refreshes.every((e) => e === row)).toBe(true);

        await s.run(CANCEL_RUN, row);
        await running;
        expect((await s.child(await s.job(), "Run Status"))?.getTreeItem().description).toBe(
            "Cancelled",
        );
        s.kernel.dispose();
    });

    it("cancels a run that goes on after the CLI exited, as with --no-wait", async () => {
        const s = await setup();
        s.kernel.runner.on(["bundle", "run"], (_args, options) => {
            options.onStdout?.(RUN_URL);
            return {};
        });
        s.http.on("GET", RUNS_GET, () =>
            s.http.to(RUNS_CANCEL).length > 0
                ? jobRun("TERMINATED", "CANCELED")
                : jobRun("RUNNING"),
        );
        s.http.on("POST", RUNS_CANCEL, { body: {} });

        const running = s.run(DEPLOY_AND_RUN_FROM_INPUT, {
            resourceType: "jobs",
            resourceKey: "etl",
            args: "--no-wait",
        });
        await expect
            .poll(() => vscode.terminals.at(-1)?.output ?? "")
            .toContain("Process completed successfully");
        await expect
            .poll(
                async () => (await s.child(await s.job(), "Run Status"))?.getTreeItem().description,
            )
            .toBe("Running");
        expect((await s.job()).getTreeItem().contextValue).toBe(
            "databricks.bundle.resource=jobs.running.cancellable.has-url.nodeType=jobs",
        );

        await s.run(CANCEL_RUN, await s.job());
        await expect.poll(() => s.http.to(RUNS_CANCEL).length, { timeout: 1000 }).toBe(1);
        await running;
        expect(JSON.parse(s.http.to(RUNS_CANCEL)[0]!.body as string)).toEqual({ run_id: 931 });
        expect((await s.child(await s.job(), "Run Status"))?.getTreeItem().description).toBe(
            "Cancelled",
        );
        expect(vscode.errors).toEqual([]);
        expect(s.reporter.events.find((e) => e.name === "bundleRun")?.properties).toMatchObject({
            "event.cancelled": "true",
        });
        s.kernel.dispose();
    }, 15_000);

    it("cancels once when Cancel is pressed twice", async () => {
        const s = await setup();
        s.kernel.runner.on(["bundle", "run"], (_args, options) => {
            options.onStdout?.(RUN_URL);
            return untilAborted(options);
        });
        s.http.on("GET", RUNS_GET, () =>
            s.http.to(RUNS_CANCEL).length > 0
                ? jobRun("TERMINATED", "CANCELED")
                : jobRun("RUNNING"),
        );
        s.http.on("POST", RUNS_CANCEL, { body: {} });

        const running = s.run(DEPLOY_AND_RUN_JOB, await s.job());
        await expect
            .poll(
                async () => (await s.child(await s.job(), "Run Status"))?.getTreeItem().description,
            )
            .toBe("Running");
        const job = await s.job();
        await Promise.all([s.run(CANCEL_RUN, job), s.run(CANCEL_RUN, job)]);
        await running;

        expect(s.http.to(RUNS_CANCEL)).toHaveLength(1);
        expect((await s.child(await s.job(), "Run Status"))?.getTreeItem().description).toBe(
            "Cancelled",
        );
        expect(vscode.errors).toEqual([]);
        s.kernel.dispose();
    });

    it("closing the terminal after the run started cancels the remote run too", async () => {
        const s = await setup();
        s.kernel.runner.on(["bundle", "run"], (_args, options) => {
            options.onStdout?.(RUN_URL);
            return untilAborted(options);
        });
        s.http.on("GET", RUNS_GET, () =>
            s.http.to(RUNS_CANCEL).length > 0
                ? jobRun("TERMINATED", "CANCELED")
                : jobRun("RUNNING"),
        );
        s.http.on("POST", RUNS_CANCEL, { body: {} });

        const running = s.run(DEPLOY_AND_RUN_JOB, await s.job());
        await expect
            .poll(
                async () => (await s.child(await s.job(), "Run Status"))?.getTreeItem().description,
            )
            .toBe("Running");
        vscode.terminals[0]!.closeByUser();
        await running;

        expect(s.http.to(RUNS_CANCEL)).toHaveLength(1);
        expect(vscode.terminals[0]!.output).toContain("Process killed by user input");
        expect((await s.child(await s.job(), "Run Status"))?.getTreeItem().description).toBe(
            "Cancelled",
        );
        expect(vscode.errors).toEqual([]);
        s.kernel.dispose();
    });

    it("closing the terminal cancels the run", async () => {
        const s = await setup();
        s.kernel.runner.on(["bundle", "run"], (_args, options) => untilAborted(options));

        const running = s.run(DEPLOY_AND_RUN_JOB, await s.job());
        await expect.poll(() => vscode.terminals.length).toBe(1);
        await expect.poll(() => s.runs().length).toBe(1);
        vscode.terminals[0]!.closeByUser();
        await running;

        expect(vscode.terminals[0]!.output).toContain("Process killed by user input");
        expect((await s.child(await s.job(), "Run Status"))?.getTreeItem().description).toBe(
            "Cancelled",
        );
        s.kernel.dispose();
    });

    it("reports a failed CLI, and shows the run's final state", async () => {
        const s = await setup();
        s.kernel.runner.on(["bundle", "run"], (_args, options) => {
            options.onStdout?.(RUN_URL);
            return { exitCode: 1, stderr: "Error: run failed with state FAILED" };
        });
        s.http.on("GET", RUNS_GET, jobRun("TERMINATED", "FAILED"));

        await s.run(DEPLOY_AND_RUN_JOB, await s.job());

        expect(vscode.errors.map((e) => e.message)).toEqual([
            "Error running resource. Process exited with code 1",
        ]);
        expect(vscode.terminals[0]!.output).toContain("Process exited with code 1");
        expect((await s.child(await s.job(), "Run Status"))?.getTreeItem().description).toBe(
            "Failed",
        );
        expect(s.reporter.events.find((e) => e.name === "bundleRun")?.properties).toMatchObject({
            "event.success": "false",
        });
        s.kernel.dispose();
    });

    it("says so when the CLI fails before a run starts", async () => {
        const s = await setup();
        s.kernel.runner.on(["bundle", "run"], { exitCode: 1, stderr: "Error: no such resource" });

        await s.run(DEPLOY_AND_RUN_JOB, await s.job());

        expect((await s.child(await s.job(), "Run Status"))?.getTreeItem().description).toBe(
            "Failed to fetch run status",
        );
        s.kernel.dispose();
    });

    it("runs the pipeline, with its update's events and datasets (BNDL-09)", async () => {
        const s = await setup();
        s.kernel.runner.on(["bundle", "run"], (_args, options) => {
            options.onStdout?.(UPDATE_URL);
            return {};
        });
        s.http.on("GET", UPDATE, update("RUNNING"), update("COMPLETED"));
        s.http.on(
            "GET",
            EVENTS,
            { body: { events: PIPELINE_EVENTS.events.slice(0, 1) } },
            { body: { events: PIPELINE_EVENTS.events.slice(1) } },
        );

        await s.run(DEPLOY_AND_RUN_PIPELINE, await s.pipeline());

        expect(s.runs()).toEqual([["bundle", "run", "--target", "dev", "pipelines.dlt"]]);
        const pipeline = await s.pipeline();
        const status = (await s.child(pipeline, "Run Status"))!;
        expect(status.getTreeItem().description).toBe("Success");
        expect(status.url).toBe(`${A}/#joblist/pipelines/p-1/updates/u-1`);
        expect((await s.labels(status)).map(([label]) => label)).toEqual([
            "Start Time",
            "Dataset `test_view` defined as VIEW.",
            "Dataset `vscode_integration_test`.`test_table` defined as MATERIALIZED_VIEW.",
            "Flow 'vscode_integration_test.test_table' has COMPLETED.",
        ]);
        // The second read asks only for newer events.
        const filters = s.http.to(EVENTS).map((r) => new URL(r.url).searchParams.get("filter"));
        expect(filters).toEqual([
            "update_id = 'u-1'",
            "update_id = 'u-1' AND timestamp > '2026-10-03T12:00:01.000Z'",
        ]);

        const datasets = (await s.child(pipeline, "Datasets"))!;
        expect(
            (await s.labels(datasets)).sort((a, b) =>
                JSON.stringify(a).localeCompare(JSON.stringify(b)),
            ),
        ).toEqual([
            ["test_view", "view"],
            ["vscode_integration_test.test_table", " "],
        ]);
        const table = (await s.child(datasets, "vscode_integration_test.test_table"))!;
        expect(await s.labels(table)).toEqual([["1", "integer"]]);
        s.kernel.dispose();
    });

    it("validates a pipeline with --validate-only", async () => {
        const s = await setup();
        s.http.on("GET", UPDATE, update("COMPLETED", { validate_only: true }));
        await s.run(DEPLOY_AND_VALIDATE_PIPELINE, await s.pipeline());
        expect(s.runs()).toEqual([
            ["bundle", "run", "--target", "dev", "pipelines.dlt", "--validate-only"],
        ]);
        s.kernel.dispose();
    });

    it("runs a resource picked from the palette, with extra arguments", async () => {
        const s = await setup();
        vscode.pickFrom = (items) => items.find((i) => i.label === "etl");
        await s.run(DEPLOY_AND_RUN_FROM_INPUT);
        await s.run(DEPLOY_AND_RUN_FROM_INPUT, {
            resourceType: "jobs",
            resourceKey: "etl",
            args: "--  --key value",
        });
        expect(s.runs()).toEqual([
            ["bundle", "run", "--target", "dev", "jobs.etl"],
            ["bundle", "run", "--target", "dev", "jobs.etl", "--", "--key", "value"],
        ]);
        expect(
            s.reporter.events
                .filter((e) => e.name === "bundleRun")
                .map((e) => e.properties?.["event.runType"]),
        ).toEqual(["manual-input", "manual-input"]);
        s.kernel.dispose();
    });

    it("spins until the CLI prints a run URL", async () => {
        const s = await setup();
        s.kernel.runner.on(["bundle", "run"], (_args, options) => untilAborted(options));
        const running = s.run(DEPLOY_AND_RUN_JOB, await s.job());
        await expect.poll(() => s.runs().length).toBe(1);
        // Before the 60 seconds are up, the row spins.
        const status = (await s.child(await s.job(), "Run Status"))!;
        expect(status.getTreeItem()).toMatchObject({ iconPath: { id: "loading~spin" } });
        await s.run(CANCEL_RUN, await s.job());
        await running;
        s.kernel.dispose();
    });

    it("forgets the runs when the target changes", async () => {
        const s = await setup();
        s.http.on("GET", RUNS_GET, jobRun("TERMINATED", "SUCCESS"));
        s.kernel.runner.on(["bundle", "run"], (_args, options) => {
            options.onStdout?.(RUN_URL);
            return {};
        });
        await s.run(DEPLOY_AND_RUN_JOB, await s.job());
        expect(await s.child(await s.job(), "Run Status")).toBeDefined();

        await s.kernel.project.selectTarget("prod");
        await when(
            s.kernel.bundle.deployed,
            (d) => d.status === "ready" && d.value.target === "prod",
        );
        expect(await s.child(await s.job(), "Run Status")).toBeUndefined();
        s.kernel.dispose();
    });
});

/** A node of the explorer, with the fields its actions read. */
function node(fields: Record<string, unknown>): TreeNode {
    return { getTreeItem: () => ({ label: "row" }), getChildren: () => [], ...fields } as TreeNode;
}

/** The row the Project view shows for a node of the Resources group. */
async function rowFor(n: TreeNode): Promise<ConfigurationItem> {
    const section = new NodeGroupSection({
        id: "test",
        order: 80,
        label: "Resources",
        groupId: "resources",
        collapsibleState: TreeItemCollapsibleState.Expanded,
        nodes: () => [n],
        log: fakeLog(),
    });
    const [group] = await section.getChildren();
    const [row] = await section.getChildren(group);
    return row!;
}

describe("the commands that take a node, given the row the Project view shows", () => {
    beforeEach(() => vscode.reset());

    it("selects the tables of the pipeline row, without an error", async () => {
        const s = await setup();
        // The datasets of earlier runs aren't served here, so the command fails after it has the
        // node. Without the node it would reject the row as an unknown resource first.
        const picked = Promise.resolve(
            s.run(DEPLOY_AND_RUN_SELECTED_TABLES, await s.pipeline()),
        ).catch(() => {});
        await Promise.race([picked, new Promise((r) => setTimeout(r, 300))]);
        expect(vscode.errors.map((e) => e.message).join("\n")).not.toContain("Cannot run resource");
        s.kernel.dispose();
    });

    it("shows the event of the row's node", async () => {
        const s = await setup();
        const row = await rowFor(
            node({
                type: "pipelines",
                resourceKey: "pipelines.dlt",
                event: { message: "Table dlt_orders failed" },
            }),
        );
        void s.run(SHOW_PIPELINE_EVENT_DETAILS, row);
        await expect
            .poll(() => vscode.infos.map((i) => i.message).join("\n"))
            .toContain("Table dlt_orders failed");
        s.kernel.dispose();
    });
});
