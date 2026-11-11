import path from "node:path";
import { readFile } from "node:fs/promises";
import { newPatCredentials } from "@databricks/sdk-auth/credentials";
import { beforeEach, describe, expect, it } from "vitest";
import type { Compute } from "../../kernel/compute/effectiveCompute";
import { ApiClients } from "../../kernel/connection/ApiClients";
import type { Connection } from "../../kernel/connection/ConnectionService";
import { fakeLog } from "../../test-support/fakes";
import { FakeHttpClient } from "../../test-support/fakeHttp";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode, type FakeWebviewPanel } from "../../test-support/vscode";
import type { RunContext } from "./RunContext";
import { runDetails, runStatus, WorkflowOutputPanel } from "./WorkflowOutputPanel";
import {
    notebookSubmission,
    pythonSubmission,
    WorkflowRunner,
    type WorkflowRunRecord,
} from "./WorkflowRunner";

/* eslint-disable @typescript-eslint/naming-convention */

const HOST = "https://a.cloud.databricks.com";
const REMOTE = "/Workspace/Users/me/.bundle/demo/dev/files";
const EXTENSION = path.resolve(__dirname, "../../..");
const tempDir = useTempDirs();

const json = async (body: unknown) =>
    JSON.parse(
        typeof body === "string"
            ? body
            : await new Response(body as ConstructorParameters<typeof Response>[0]).text(),
    ) as Record<string, unknown>;

/** A Jobs API that runs every submitted run to `result`, and the workspace import the wrappers use. */
function jobsApi(
    http: FakeHttpClient,
    options: {
        result?: string;
        output?: Record<string, unknown>;
        pending?: boolean;
        noTasks?: boolean;
        stateMessage?: string;
    } = {},
) {
    const submitted: Record<string, unknown>[] = [];
    const imported: { path: string; content: string; format: string; overwrite: boolean }[] = [];
    const cancelled: unknown[] = [];
    let polls = 0;
    const run = (state: Record<string, unknown>) => ({
        run_id: 42,
        run_page_url: `${HOST}/#job/1/run/42`,
        state,
        tasks:
            options.noTasks === true
                ? []
                : [
                      {
                          run_id: 43,
                          task_key: "js_sdk_job_run",
                          start_time: 1_000,
                          end_time: 4_000,
                          cluster_instance: { cluster_id: "cluster-1", spark_context_id: "77" },
                      },
                  ],
    });
    http.on("POST", "/api/2.2/jobs/runs/submit", async (r) => {
        submitted.push(await json(r.body));
        return { body: { run_id: 42 } };
    })
        .on("GET", "/api/2.2/jobs/runs/get", () =>
            ++polls < 2 || options.pending === true
                ? { body: run({ life_cycle_state: "PENDING" }) }
                : {
                      body: run({
                          life_cycle_state: "TERMINATED",
                          result_state: options.result ?? "SUCCESS",
                          ...(options.stateMessage !== undefined
                              ? { state_message: options.stateMessage }
                              : {}),
                      }),
                  },
        )
        .on("GET", "/api/2.2/jobs/runs/export", {
            body: {
                views: [
                    {
                        content: "<html><body>hello world</body></html>",
                        name: "nb",
                        type: "NOTEBOOK",
                    },
                ],
            },
        })
        .on("GET", "/api/2.2/jobs/runs/get-output", {
            body: options.output ?? { logs: "hello world\n" },
        })
        .on("POST", "/api/2.2/jobs/runs/cancel", async (r) => {
            cancelled.push(await json(r.body));
            return { body: {} };
        })
        .on("POST", "/api/2.0/workspace/import", async (r) => {
            const body = (await json(r.body)) as {
                path: string;
                content: string;
                format: string;
                overwrite: boolean;
            };
            imported.push({
                ...body,
                content: Buffer.from(body.content, "base64").toString("utf-8"),
            });
            return { body: {} };
        });
    return { submitted, imported, cancelled, polls: () => polls };
}

function setup(
    options: {
        compute?: Compute | null;
        mode?: string;
        result?: string;
        output?: Record<string, unknown>;
        pending?: boolean;
        upload?: () => Promise<void>;
        noTasks?: boolean;
        stateMessage?: string;
    } = {},
) {
    const t = tempDir();
    const http = new FakeHttpClient();
    const api = jobsApi(http, options);
    const connection = {
        host: HOST,
        api: new ApiClients({
            host: HOST,
            credentials: newPatCredentials("dapi-1"),
            httpClient: http,
        }),
    } as unknown as Connection;
    const events: string[] = [];
    const records: WorkflowRunRecord[] = [];
    const ctx: RunContext = {
        log: fakeLog(),
        connection: async () => connection,
        target: async () => ({
            mode: options.mode ?? "development",
            destination: { localRoot: t.dir, remoteRoot: REMOTE },
        }),
        progress: (signal, task) => task(signal, () => {}),
        upload: async () => {
            events.push("upload");
            await options.upload?.();
        },
        focusDebugConsole: async () => {},
        compute: () =>
            options.compute === null
                ? undefined
                : (options.compute ?? {
                      kind: "cluster",
                      clusterId: "cluster-1",
                      source: "bundle",
                  }),
        getCluster: async (id) => ({ id, name: "shared", state: "RUNNING" }),
        prompts: {
            changeTargetMode: (mode) => events.push(`prompt: change target mode (${mode})`),
            attachCluster: () => events.push("prompt: attach cluster"),
            startCluster: () => events.push("prompt: start cluster"),
        },
        readResource: (name) =>
            readFile(path.join(EXTENSION, "resources", "python", name), "utf-8"),
        rearrangeCells: () => true,
        showError: () => {},
    };
    const runner = new WorkflowRunner({
        ctx,
        panelFor: (program) =>
            WorkflowOutputPanel.create(EXTENSION, path.basename(program), fakeLog()),
        startRecord: () => (record) => records.push(record),
        pollIntervalMs: 1,
    });
    const panel = (): FakeWebviewPanel => vscode.webviewPanels.at(-1)!;
    const posted = () => panel().posted as { fn: string; args: unknown[] }[];
    return { t, http, api, runner, events, records, panel, posted };
}

describe("WorkflowRunner", () => {
    beforeEach(() => vscode.reset());

    it("runs a Python file on the cluster through its wrapper, and shows the logs (RUN-02)", async () => {
        const s = setup();
        const program = s.t.write("nested dir/hello.py", "print('hello world')\n");

        expect(await s.runner.run({ program, args: ["a"] }, new AbortController().signal)).toEqual({
            ok: true,
        });

        const wrapper = `/Users/me/.bundle/demo/dev/files/nested dir/hello.databricks.file.workflow-wrapper.py`;
        expect(s.api.imported).toEqual([
            expect.objectContaining({ path: wrapper, format: "AUTO", overwrite: true }),
        ]);
        expect(s.api.imported[0]!.content).toContain(
            `python_file = '${REMOTE}/nested dir/hello.py'`,
        );
        expect(s.api.imported[0]!.content).toContain(`project_root = '${REMOTE}'`);
        // Golden payload: the old `runPythonAndWait`'s.
        expect(s.api.submitted).toEqual([
            {
                tasks: [
                    {
                        task_key: "js_sdk_job_run",
                        spark_python_task: { python_file: wrapper, parameters: ["a"] },
                        existing_cluster_id: "cluster-1",
                    },
                ],
            },
        ]);
        expect(s.panel().title).toBe("hello.py - Databricks Job Run");
        expect(s.posted().at(-1)).toEqual({ fn: "setStdout", args: ["hello world\n"] });
        expect(
            s
                .posted()
                .filter((m) => m.fn === "updateDetails")
                .map((m) => (m.args[0] as { status: string }).status),
        ).toEqual(["Pending", "Succeeded"]);
        expect(s.records).toEqual([{ success: true, taskType: "python", computeType: "cluster" }]);
    });

    it("runs a Python file serverless, with an environment (golden payload)", async () => {
        const s = setup({ compute: { kind: "serverless", source: "profile" } });
        const program = s.t.write("hello.py", "print('hello world')\n");
        await s.runner.run({ program }, new AbortController().signal);

        expect(s.api.submitted).toEqual([
            {
                tasks: [
                    {
                        task_key: "js_sdk_job_run",
                        spark_python_task: {
                            python_file:
                                "/Users/me/.bundle/demo/dev/files/hello.databricks.file.workflow-wrapper.py",
                            parameters: [],
                        },
                        environment_key: "js_sdk_job_run_environment",
                    },
                ],
                environments: [
                    { environment_key: "js_sdk_job_run_environment", spec: { client: "1" } },
                ],
            },
        ]);
        const details = s.posted().find((m) => m.fn === "updateDetails")!.args[0] as {
            serverless: boolean;
            clusterUrl: string;
        };
        expect(details).toMatchObject({ serverless: true, clusterUrl: "#" });
        expect(s.records).toEqual([
            { success: true, taskType: "python", computeType: "serverless" },
        ]);
    });

    it("runs a Databricks notebook through its wrapper, and shows the exported run", async () => {
        const s = setup();
        const program = s.t.write(
            "a/b c/notebook.py",
            "# Databricks notebook source\nspark.sql('SELECT 1')\n",
        );
        await s.runner.run({ program, parameters: { p: "1" } }, new AbortController().signal);

        expect(s.api.imported[0]!.path).toBe(
            "/Users/me/.bundle/demo/dev/files/a/b c/notebook.databricks.notebook.workflow-wrapper.py",
        );
        expect(
            s.api.imported[0]!.content.startsWith(
                "# Databricks notebook source\n# This cell is autogenerated",
            ),
        ).toBe(true);
        // Golden payload: the old `runNotebookAndWait`'s; the notebook is imported without its extension.
        expect(s.api.submitted).toEqual([
            {
                tasks: [
                    {
                        task_key: "js_sdk_job_run",
                        notebook_task: {
                            notebook_path:
                                "/Users/me/.bundle/demo/dev/files/a/b c/notebook.databricks.notebook.workflow-wrapper",
                            base_parameters: { p: "1" },
                        },
                        depends_on: [],
                        libraries: [],
                        existing_cluster_id: "cluster-1",
                    },
                ],
            },
        ]);
        expect(s.posted().at(-1)).toEqual({
            fn: "setOutputHtml",
            args: ["<html><body>hello world</body></html>"],
        });
        expect(s.records).toEqual([
            { success: true, taskType: "notebook", computeType: "cluster" },
        ]);
    });

    it("runs a Jupyter notebook serverless, without a cluster", async () => {
        const s = setup({ compute: { kind: "serverless", source: "override" } });
        const program = s.t.write(
            "notebook.ipynb",
            JSON.stringify({
                cells: [{ cell_type: "code", source: ["print(1)"], metadata: {}, outputs: [] }],
                nbformat: 4,
            }),
        );
        await s.runner.run({ program }, new AbortController().signal);

        expect(s.api.imported[0]!.path).toBe(
            "/Users/me/.bundle/demo/dev/files/notebook.databricks.notebook.workflow-wrapper.ipynb",
        );
        const task = (s.api.submitted[0]!.tasks as Record<string, unknown>[])[0]!;
        expect(task).toEqual({
            task_key: "js_sdk_job_run",
            notebook_task: {
                notebook_path:
                    "/Users/me/.bundle/demo/dev/files/notebook.databricks.notebook.workflow-wrapper",
                base_parameters: {},
            },
            depends_on: [],
            libraries: [],
        });
    });

    it("runs a Scala notebook as it is", async () => {
        const s = setup();
        const program = s.t.write("nb.scala", "// Databricks notebook source\nprintln(1)\n");
        await s.runner.run({ program }, new AbortController().signal);
        expect(s.api.imported).toEqual([]);
        expect(
            (s.api.submitted[0]!.tasks as Record<string, { notebook_path: string }>[])[0]!
                .notebook_task.notebook_path,
        ).toBe("/Users/me/.bundle/demo/dev/files/nb");
    });

    it("refuses other files, and checks the target and the compute first", async () => {
        const s = setup();
        expect(
            await s.runner.run({ program: s.t.write("x.txt", "") }, new AbortController().signal),
        ).toEqual({
            ok: false,
            error: "Only Python files can be run as a workflow",
        });
        const prod = setup({ mode: "production" });
        expect(
            (
                await prod.runner.run(
                    { program: prod.t.write("a.py", "") },
                    new AbortController().signal,
                )
            ).ok,
        ).toBe(false);
        expect(prod.events).toEqual(["prompt: change target mode (production)"]);
        const none = setup({ compute: null });
        await none.runner.run({ program: none.t.write("a.py", "") }, new AbortController().signal);
        expect(none.events).toEqual(["prompt: attach cluster"]);
        expect(vscode.webviewPanels).toEqual([]);
    });

    it("shows a failed upload in the panel, with the old message", async () => {
        const s = setup({ upload: () => Promise.reject(new Error("no permission")) });
        await s.runner.run({ program: s.t.write("a.py", "") }, new AbortController().signal);
        expect(s.posted()).toContainEqual({
            fn: "setError",
            args: [
                "Can't upload assets to databricks workspace. \nReason: no permission",
                undefined,
            ],
        });
        expect(s.api.submitted).toEqual([]);
    });

    it("shows a failed Python run's error and trace, escaped, with its logs", async () => {
        const s = setup({
            result: "FAILED",
            output: {
                error: "ValueError: boom",
                error_trace: "\u001b[0;31m<b>trace</b>\u001b[0m",
                logs: "before\n",
            },
        });
        await s.runner.run({ program: s.t.write("a.py", "") }, new AbortController().signal);
        const error = s.posted().find((m) => m.fn === "setError")!;
        expect(error.args[0]).toBe("ValueError: boom");
        expect(error.args[1]).toContain("&lt;b&gt;trace&lt;/b&gt;");
        expect(s.posted().at(-1)).toEqual({ fn: "setStdout", args: ["before\n"] });
        expect(
            s
                .posted()
                .filter((m) => m.fn === "updateDetails")
                .at(-1)!.args[0],
        ).toMatchObject({ status: "Failed" });
    });

    it("shows a refused submission's reason in the panel, and polls nothing", async () => {
        const s = setup();
        s.http.on("POST", "/api/2.2/jobs/runs/submit", {
            status: 400,
            body: {
                error_code: "INVALID_PARAMETER_VALUE",
                message: "Cluster cluster-1 does not exist",
            },
        });
        const result = await s.runner.run(
            { program: s.t.write("a.py", "") },
            new AbortController().signal,
        );
        expect(result).toEqual({ ok: true });
        expect(s.posted().filter((m) => m.fn === "setError")).toEqual([
            { fn: "setError", args: ["Cluster cluster-1 does not exist", undefined] },
        ]);
        expect(s.api.polls()).toBe(0);
        expect(s.records).toEqual([{ success: false, taskType: "python", computeType: "cluster" }]);
    });

    it("says how to pick a cluster when a run on the serverless default is refused", async () => {
        const s = setup({ compute: { kind: "serverless", source: "default" } });
        s.http.on("POST", "/api/2.2/jobs/runs/submit", {
            status: 400,
            body: {
                error_code: "INVALID_PARAMETER_VALUE",
                message: "Serverless compute is not enabled",
            },
        });
        await s.runner.run({ program: s.t.write("a.py", "") }, new AbortController().signal);
        const error = s.posted().find((m) => m.fn === "setError")!;
        expect(error.args[0]).toBe(
            "Serverless compute is not enabled\nServerless compute is the default when no compute is chosen. If this workspace doesn't offer serverless compute, choose a cluster in the Compute view.",
        );
    });

    it("shows a run's own reason when it ends without tasks, with the hint for a serverless reason on the default", async () => {
        const s = setup({
            compute: { kind: "serverless", source: "default" },
            noTasks: true,
            stateMessage: "Serverless compute is not available in this workspace",
        });
        await s.runner.run({ program: s.t.write("a.py", "") }, new AbortController().signal);
        expect(s.posted().find((m) => m.fn === "setError")!.args[0]).toMatch(
            /^Serverless compute is not available in this workspace\nServerless compute is the default/,
        );
    });

    it("says no tasks, with no reason, when the run gave none, and gives an unrelated reason no hint", async () => {
        const bare = setup({ compute: { kind: "serverless", source: "default" }, noTasks: true });
        await bare.runner.run({ program: bare.t.write("a.py", "") }, new AbortController().signal);
        expect(bare.posted().find((m) => m.fn === "setError")!.args[0]).toBe("Run has no tasks");

        const other = setup({
            compute: { kind: "serverless", source: "default" },
            noTasks: true,
            stateMessage: "Cluster cluster-1 was terminated",
        });
        await other.runner.run(
            { program: other.t.write("a.py", "") },
            new AbortController().signal,
        );
        expect(other.posted().find((m) => m.fn === "setError")!.args[0]).toBe(
            "Cluster cluster-1 was terminated",
        );
    });

    it("gives no hint to a refusal on the default that isn't about serverless compute", async () => {
        const s = setup({ compute: { kind: "serverless", source: "default" } });
        s.http.on("POST", "/api/2.2/jobs/runs/submit", {
            status: 400,
            body: { error_code: "INVALID_PARAMETER_VALUE", message: "Workspace is read-only" },
        });
        await s.runner.run({ program: s.t.write("a.py", "") }, new AbortController().signal);
        expect(s.posted().find((m) => m.fn === "setError")!.args[0]).toBe("Workspace is read-only");
    });

    it("adds the hint to a run that ends failed on the default with a serverless error, and only then", async () => {
        const failed = setup({
            compute: { kind: "serverless", source: "default" },
            result: "FAILED",
            output: { error: "Serverless compute is not available in this workspace" },
        });
        await failed.runner.run(
            { program: failed.t.write("a.py", "") },
            new AbortController().signal,
        );
        expect(failed.posted().find((m) => m.fn === "setError")!.args[0]).toMatch(
            /^Serverless compute is not available in this workspace\nServerless compute is the default/,
        );

        const unrelated = setup({
            compute: { kind: "serverless", source: "default" },
            result: "FAILED",
            output: { error: "ValueError: boom" },
        });
        await unrelated.runner.run(
            { program: unrelated.t.write("a.py", "") },
            new AbortController().signal,
        );
        expect(unrelated.posted().find((m) => m.fn === "setError")!.args[0]).toBe(
            "ValueError: boom",
        );
    });

    it("leaves a refused run on chosen serverless compute as it was", async () => {
        const s = setup({ compute: { kind: "serverless", source: "override" } });
        s.http.on("POST", "/api/2.2/jobs/runs/submit", {
            status: 400,
            body: { error_code: "INVALID_PARAMETER_VALUE", message: "Refused" },
        });
        await s.runner.run({ program: s.t.write("a.py", "") }, new AbortController().signal);
        expect(s.posted().find((m) => m.fn === "setError")!.args[0]).toBe("Refused");
    });

    it("cancels the run, and says so in the panel, when the session is stopped while it runs", async () => {
        const s = setup({ pending: true });
        const controller = new AbortController();
        const running = s.runner.run({ program: s.t.write("a.py", "") }, controller.signal);
        await expect.poll(() => s.api.polls()).toBeGreaterThan(0);
        controller.abort();
        await running;
        expect(s.api.cancelled).toEqual([{ run_id: 42 }]);
        expect(s.posted().at(-1)).toEqual({
            fn: "setError",
            args: ["Execution terminated by user.", undefined],
        });
        expect(s.records).toEqual([{ success: false, taskType: "python", computeType: "cluster" }]);
    });

    it("cancels the run when the panel is closed", async () => {
        const s = setup({ pending: true });
        const program = s.t.write("a.py", "");
        const running = s.runner.run({ program }, new AbortController().signal);
        await expect.poll(() => s.api.polls()).toBeGreaterThan(0);
        s.panel().dispose();
        await running;
        expect(s.api.cancelled).toEqual([{ run_id: 42 }]);
        expect(s.records).toEqual([{ success: false, taskType: "python", computeType: "cluster" }]);
    });

    it("refreshes the results when the page asks", async () => {
        const s = setup();
        await s.runner.run({ program: s.t.write("a.py", "") }, new AbortController().signal);
        s.panel().receive({ command: "refresh_results", args: { runId: "43" } });
        await expect.poll(() => s.posted().filter((m) => m.fn === "setStdout").length).toBe(2);
        expect(
            s.http
                .to("/api/2.2/jobs/runs/get-output")
                .map((r) => new URL(r.url).searchParams.get("run_id")),
        ).toEqual(["43", "43"]);
    });
});

describe("the page", () => {
    beforeEach(() => vscode.reset());

    it("keeps the old ids and labels, and runs under a CSP that lets the notebook render in a sandbox without same-origin", async () => {
        await WorkflowOutputPanel.create(EXTENSION, "hello.py", fakeLog());
        const html = vscode.webviewPanels[0]!.html;
        for (const label of ["task-run-id", "run-start-time", "run-status"]) {
            expect(html).toContain(`aria-label="${label}"`);
        }
        expect(html).toContain('id="frame"');
        expect(/sandbox="([^"]*)"/.exec(html)?.[1]).toBe(
            "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-downloads allow-forms",
        );
        expect(html).toMatch(/script-src 'nonce-[^']+' 'strict-dynamic'/);
        expect(html).not.toContain("<script src");
    });

    it("maps the run's state to the status the specs wait for", () => {
        expect(runStatus({ lifeCycleState: "TERMINATED", resultState: "SUCCESS" })).toBe(
            "Succeeded",
        );
        expect(runStatus({ lifeCycleState: "TERMINATED", resultState: "FAILED" })).toBe("Failed");
        expect(runStatus({ lifeCycleState: "TERMINATED", resultState: "CANCELED" })).toBe(
            "Cancelled",
        );
        expect(runStatus({ lifeCycleState: "QUEUED" })).toBe("Pending");
        expect(runStatus({ lifeCycleState: "RUNNING" })).toBe("Running");
        expect(runStatus({ lifeCycleState: "INTERNAL_ERROR" })).toBe("Failed");
        expect(runStatus(undefined)).toBe("Unknown");
    });

    it("computes the details as before: the task's ID, times, duration and Spark UI link", () => {
        const details = runDetails(
            {
                runPageUrl: `${HOST}/#job/1/run/42`,
                state: { lifeCycleState: "RUNNING" },
                tasks: [
                    {
                        runId: 43n,
                        startTime: 1_000n,
                        clusterInstance: { clusterId: "cluster-1", sparkContextId: "77" },
                    },
                ],
            },
            HOST,
            "cluster-1",
            6_000,
        );
        expect(details).toMatchObject({
            runId: "43",
            clusterId: "cluster-1",
            clusterUrl: `${HOST}/#setting/sparkui/cluster-1/driver-77`,
            ended: "-",
            duration: 5_000,
            status: "Running",
            serverless: false,
        });
        expect(runDetails({}, HOST, undefined)).toMatchObject({
            runId: "N/A",
            started: "-",
            duration: -1,
            clusterId: "-",
        });
    });
});

describe("submissions", () => {
    it("notebook and Python file, on a cluster and serverless", () => {
        expect(notebookSubmission("/nb", {}, undefined).tasks![0]!.spec).toBeUndefined();
        expect(pythonSubmission("/f.py", [], "c").environments).toBeUndefined();
    });
});
