import { newPatCredentials } from "@databricks/sdk-auth/credentials";
import type { TreeItem } from "vscode";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClients } from "../../../kernel/connection";
import { fakeLog } from "../../../test-support/fakes";
import { FakeHttpClient, type FakeResponse } from "../../../test-support/fakeHttp";
import { explorerRoots, type ExplorerNode } from "../nodes";
import { JobRunTracker } from "./JobRunTracker";
import { PipelineDatasets } from "./pipelineDatasets";
import { PipelineRunTracker } from "./PipelineRunTracker";
import { RunTrackers } from "./RunTrackers";

/*
 * What the explorer shows when the run's status can't be read: the API
 * rejects the token, fails, can't be reached or answers with something that
 * isn't JSON. The trackers run as the feature runs them, with shorter waits.
 */

const HOST = "https://h";
const RUNS_GET = "/api/2.2/jobs/runs/get";
const UPDATE = "/api/2.0/pipelines/p-1/updates/u-1";
const EVENTS = "/api/2.0/pipelines/p-1/events";
const RUN_URL = `Run URL: ${HOST}/jobs/11/runs/931?o=1\n`;
const UPDATE_URL = `Update URL: ${HOST}/#joblist/pipelines/p-1/updates/u-1\n`;
const SUMMARY = {
    resources: {
        jobs: {
            etl: {
                id: "11",
                name: "etl",
                tasks: [{ task_key: "nb", notebook_task: { notebook_path: "src/nb" } }],
            },
        },
        pipelines: { dlt: { id: "p-1", name: "dlt" } },
    },
};

const UNAUTHENTICATED: FakeResponse = {
    status: 401,
    body: { error_code: "UNAUTHENTICATED", message: "Invalid access token." },
};
const SERVER_ERROR: FakeResponse = {
    status: 500,
    body: { error_code: "INTERNAL_ERROR", message: "Something went wrong." },
};
const NOT_JSON: FakeResponse = {
    status: 200,
    text: "<html><body>Sign in to your proxy</body></html>",
    headers: { "content-type": "text/html" },
};
const jobRun = (life_cycle_state: string, result_state?: string): FakeResponse => ({
    body: {
        job_id: 11,
        run_id: 931,
        run_page_url: `${HOST}/jobs/11/runs/931`,
        state: { life_cycle_state, result_state },
        tasks: [{ task_key: "nb", run_id: 932, state: { life_cycle_state, result_state } }],
    },
});
const update = (state: string): FakeResponse => ({
    body: { update: { pipeline_id: "p-1", update_id: "u-1", state, creation_time: 1759492800000 } },
});

function setup(http: FakeHttpClient) {
    const api = new ApiClients({
        host: HOST,
        credentials: newPatCredentials("dapi-1"),
        httpClient: http,
    });
    const log = fakeLog();
    const trackers = new RunTrackers();
    const datasets = new PipelineDatasets(
        (key) => trackers.pipelineHistory(key),
        () => api,
    );
    const options = { log, pollMs: 5, idTimeoutMs: 60_000, maxFailedPolls: 3 };
    const roots = () =>
        explorerRoots(SUMMARY, {
            host: HOST,
            root: "/project",
            asAbsolutePath: (p) => `/extension/${p}`,
            runs: trackers,
            datasets,
        });
    const resource = (header: string) =>
        roots()
            .find((r) => r.getTreeItem().label === header)!
            .getChildren() as ExplorerNode[];
    const job = () => resource("Jobs")[0]!;
    const pipeline = () => resource("Pipelines")[0]!;
    const child = async (node: ExplorerNode, label: string) =>
        (await node.getChildren()).find((c) => c.getTreeItem().label === label)!;
    return { api, log, trackers, options, job, pipeline, child };
}

/** A row as the user reads it: its description and its icon. */
function shown(item: TreeItem) {
    return {
        description: item.description,
        icon: (item.iconPath as { id?: string } | undefined)?.id,
    };
}

/** The job's Run Status row, and its task's. */
async function statusRows(s: ReturnType<typeof setup>) {
    const task = (await (await s.child(s.job(), "Tasks")).getChildren())[0]!;
    return {
        run: shown((await s.child(s.job(), "Run Status")).getTreeItem()),
        task: shown((await task.getChildren())[0]!.getTreeItem()),
    };
}

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("a job run whose status can't be read", () => {
    it.each([
        ["the token is rejected", UNAUTHENTICATED],
        ["the API fails", SERVER_ERROR],
        ["the answer isn't JSON", NOT_JSON],
    ])("stops polling, and says so, when %s from the first read", async (_case, response) => {
        const http = new FakeHttpClient().on("GET", RUNS_GET, response);
        const s = setup(http);
        const tracker = new JobRunTracker(s.api, s.options);
        s.trackers.add("jobs.etl", tracker);
        tracker.write(RUN_URL);

        await expect.poll(() => tracker.state).toBe("error");
        await new Promise((r) => setTimeout(r, 50));
        expect(http.to(RUNS_GET)).toHaveLength(3);
        expect(shown((await s.child(s.job(), "Run Status")).getTreeItem())).toEqual({
            description: "Failed to fetch run status",
            icon: "testing-error-icon",
        });
        expect(s.job().getTreeItem().contextValue).toBe(
            "databricks.bundle.resource=jobs.runnable.has-url.nodeType=jobs",
        );
        s.trackers.dispose();
    });

    it("stops polling, and no row keeps spinning, when reads fail after the run was seen running", async () => {
        const http = new FakeHttpClient().on("GET", RUNS_GET, jobRun("RUNNING"), SERVER_ERROR);
        const s = setup(http);
        const tracker = new JobRunTracker(s.api, s.options);
        s.trackers.add("jobs.etl", tracker);
        tracker.write(RUN_URL);

        await expect.poll(() => tracker.state).toBe("error");
        await new Promise((r) => setTimeout(r, 50));
        expect(http.to(RUNS_GET)).toHaveLength(4);
        expect(s.job().getTreeItem().contextValue).toBe(
            "databricks.bundle.resource=jobs.runnable.has-url.nodeType=jobs",
        );
        expect(await statusRows(s)).toEqual({
            run: { description: "Failed to fetch run status", icon: "testing-error-icon" },
            task: { description: "Failed to fetch run status", icon: "testing-error-icon" },
        });
        // The run's page is still a click away, and what was read is still there.
        const status = await s.child(s.job(), "Run Status");
        expect(status.getTreeItem().contextValue).toBe(
            "databricks.bundle.has-url.nodeType=job_run_status",
        );
        expect((await status.getChildren()).map((c) => c.getTreeItem().label)).toEqual([
            "Start Time",
            "Duration",
        ]);
        s.trackers.dispose();
    });

    it("doesn't show the run as running when the CLI failed and the run's status can't be read", async () => {
        const http = new FakeHttpClient().on("GET", RUNS_GET, jobRun("RUNNING"), UNAUTHENTICATED);
        const s = setup(http);
        const tracker = new JobRunTracker(s.api, { ...s.options, pollMs: 60_000 });
        s.trackers.add("jobs.etl", tracker);
        tracker.write(RUN_URL);
        await expect.poll(() => tracker.data?.state?.lifeCycleState).toBe("RUNNING");

        await tracker.cliExited(false);

        expect(tracker.state).toBe("error");
        expect(await statusRows(s)).toEqual({
            run: { description: "Failed to fetch run status", icon: "testing-error-icon" },
            task: { description: "Failed to fetch run status", icon: "testing-error-icon" },
        });
        s.trackers.dispose();
    });

    it("retries a read that can't reach the workspace with backoff, then gives up", async () => {
        vi.useFakeTimers();
        // The longest of the SDK's random backoff delays: 0.5, 1, 2, 4 and 8 seconds.
        vi.spyOn(Math, "random").mockReturnValue(0.9999);
        const http = new FakeHttpClient().on("GET", RUNS_GET, () => {
            throw new TypeError("fetch failed", {
                cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
            });
        });
        const s = setup(http);
        const tracker = new JobRunTracker(s.api, { ...s.options, pollMs: 3000, maxFailedPolls: 2 });
        s.trackers.add("jobs.etl", tracker);
        tracker.write(RUN_URL);

        // The first read: one request and five retries, the last after 15.5 seconds.
        await vi.advanceTimersByTimeAsync(15_000);
        expect(http.to(RUNS_GET)).toHaveLength(5);
        await vi.advanceTimersByTimeAsync(1000);
        expect(http.to(RUNS_GET)).toHaveLength(6);
        expect(tracker.state).toBe("running");
        // The second, 3 seconds after the first failed, is the last.
        await vi.advanceTimersByTimeAsync(3000 + 15_500);
        expect(http.to(RUNS_GET)).toHaveLength(12);
        expect(tracker.state).toBe("error");
        await vi.advanceTimersByTimeAsync(60_000);
        expect(http.to(RUNS_GET)).toHaveLength(12);
        expect(shown((await s.child(s.job(), "Run Status")).getTreeItem()).description).toBe(
            "Failed to fetch run status",
        );
        s.trackers.dispose();
    });
});

describe("a pipeline update whose status can't be read", () => {
    it("stops polling, and says so, when the token is rejected", async () => {
        const http = new FakeHttpClient().on("GET", UPDATE, UNAUTHENTICATED);
        const s = setup(http);
        const tracker = new PipelineRunTracker(s.api, "p-1", s.options);
        s.trackers.add("pipelines.dlt", tracker);
        tracker.write(UPDATE_URL);

        await expect.poll(() => tracker.state).toBe("error");
        await new Promise((r) => setTimeout(r, 50));
        expect(http.to(UPDATE)).toHaveLength(3);
        expect(shown((await s.child(s.pipeline(), "Run Status")).getTreeItem())).toEqual({
            description: "Failed to fetch run status",
            icon: "testing-error-icon",
        });
        expect(s.pipeline().getTreeItem().contextValue).toBe(
            "databricks.bundle.resource=pipelines.runnable.has-url.nodeType=pipelines",
        );
        s.trackers.dispose();
    });

    it("stops polling, and no row keeps spinning, when its events can't be read", async () => {
        const http = new FakeHttpClient()
            .on("GET", UPDATE, update("RUNNING"))
            .on("GET", EVENTS, SERVER_ERROR)
            .on("GET", "/api/2.0/pipelines/p-1/updates", { body: { updates: [] } });
        const s = setup(http);
        const tracker = new PipelineRunTracker(s.api, "p-1", s.options);
        s.trackers.add("pipelines.dlt", tracker);
        tracker.write(UPDATE_URL);

        await expect.poll(() => tracker.state).toBe("error");
        await new Promise((r) => setTimeout(r, 50));
        expect(http.to(EVENTS)).toHaveLength(3);
        expect(shown((await s.child(s.pipeline(), "Run Status")).getTreeItem())).toEqual({
            description: "Failed to fetch run status",
            icon: "testing-error-icon",
        });
        const datasets = await s.child(s.pipeline(), "Datasets");
        expect(shown(datasets.getTreeItem()).icon).toBe("database");
        expect((await datasets.getChildren()).map((c) => c.getTreeItem().label)).toEqual([
            "Run or validate the pipeline to see datasets",
        ]);
        s.trackers.dispose();
    });
});
