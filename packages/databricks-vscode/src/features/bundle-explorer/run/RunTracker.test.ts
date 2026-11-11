import { newPatCredentials } from "@databricks/sdk-auth/credentials";
import { describe, expect, it } from "vitest";
import { ApiClients } from "../../../kernel/connection";
import { fakeLog } from "../../../test-support/fakes";
import { FakeHttpClient } from "../../../test-support/fakeHttp";
import { JobRunTracker } from "./JobRunTracker";
import { PipelineRunTracker } from "./PipelineRunTracker";

/* eslint-disable @typescript-eslint/naming-convention */

const RUNS_GET = "/api/2.2/jobs/runs/get";
const run = (life_cycle_state: string, result_state?: string) => ({
    body: { run_id: 7, state: { life_cycle_state, result_state } },
});

function setup(http: FakeHttpClient) {
    const api = new ApiClients({
        host: "https://h",
        credentials: newPatCredentials("dapi-1"),
        httpClient: http,
    });
    const log = fakeLog();
    return { api, log, options: { log, pollMs: 5, idTimeoutMs: 50, maxFailedPolls: 2 } };
}

describe("JobRunTracker", () => {
    it("reads the run ID from output split across chunks, and polls until the run ends", async () => {
        const http = new FakeHttpClient().on(
            "GET",
            RUNS_GET,
            run("PENDING"),
            run("RUNNING"),
            run("TERMINATED", "SUCCESS"),
        );
        const s = setup(http);
        const tracker = new JobRunTracker(s.api, s.options);
        tracker.write("Run URL: https://h/jobs/1/ru");
        tracker.write("ns/7?o=1\nother output\n");
        expect(tracker.runId).toBe("7");
        await expect.poll(() => tracker.state).toBe("completed");
        expect(http.to(RUNS_GET).map((r) => new URL(r.url).searchParams.get("run_id"))).toEqual([
            "7",
            "7",
            "7",
        ]);
        expect(tracker.data?.state?.resultState).toBe("SUCCESS");
        tracker.dispose();
    });

    it("stops on SKIPPED, which the old tracker polled forever", async () => {
        const http = new FakeHttpClient().on("GET", RUNS_GET, run("SKIPPED"));
        const tracker = new JobRunTracker(setup(http).api, setup(http).options);
        tracker.write("https://h/?o=1#job/1/run/7\n");
        await expect.poll(() => tracker.state).toBe("completed");
        expect(http.to(RUNS_GET)).toHaveLength(1);
        tracker.dispose();
    });

    it("times out without a run ID", async () => {
        const s = setup(new FakeHttpClient());
        const tracker = new JobRunTracker(s.api, s.options);
        let changes = 0;
        tracker.onDidChange(() => changes++);
        expect(tracker.state).toBe("unknown");
        await expect.poll(() => tracker.state).toBe("timeout");
        expect(changes).toBe(1);
        tracker.write("Run URL: https://h/jobs/1/runs/7\n");
        expect(tracker.runId).toBeUndefined();
        tracker.dispose();
    });

    it("gives up after repeated failed reads", async () => {
        const http = new FakeHttpClient().on("GET", RUNS_GET, {
            status: 400,
            body: { error_code: "INVALID_PARAMETER_VALUE", message: "no" },
        });
        const s = setup(http);
        const tracker = new JobRunTracker(s.api, s.options);
        tracker.write("Run URL: https://h/jobs/1/runs/7\n");
        await expect.poll(() => tracker.state).toBe("error");
        expect(http.to(RUNS_GET)).toHaveLength(2);
        expect(
            s.log.entries.filter((e) => e.message.startsWith("Failed to check the run status")),
        ).toHaveLength(2);
        tracker.dispose();
    });

    it("cancels a run that hasn't started without calling the API", async () => {
        const http = new FakeHttpClient();
        const tracker = new JobRunTracker(setup(http).api, setup(http).options);
        await tracker.cancel();
        expect(tracker.state).toBe("cancelled");
        expect(http.requests).toEqual([]);
        tracker.dispose();
    });

    it("stops polling when disposed, and fires nothing after", async () => {
        const http = new FakeHttpClient().on("GET", RUNS_GET, run("RUNNING"));
        const s = setup(http);
        const tracker = new JobRunTracker(s.api, { ...s.options, pollMs: 10 });
        tracker.write("Run URL: https://h/jobs/1/runs/7\n");
        await expect.poll(() => http.to(RUNS_GET).length).toBeGreaterThan(0);
        tracker.dispose();
        const calls = http.to(RUNS_GET).length;
        await new Promise((r) => setTimeout(r, 50));
        expect(http.to(RUNS_GET).length).toBeLessThanOrEqual(calls + 1);
    });
});

describe("PipelineRunTracker", () => {
    const UPDATE = "/api/2.0/pipelines/p-1/updates/u-1";
    const update = (state: string) => ({
        body: { update: { pipeline_id: "p-1", update_id: "u-1", state } },
    });

    it("stops only an update that still runs", async () => {
        const http = new FakeHttpClient()
            .on("GET", UPDATE, update("RUNNING"), update("RUNNING"), update("CANCELED"))
            .on("GET", "/api/2.0/pipelines/p-1/events", { body: { events: [] } })
            .on("POST", "/api/2.0/pipelines/p-1/stop", { body: {} })
            .on("GET", "/api/2.0/pipelines/p-1", { body: { pipeline_id: "p-1", state: "IDLE" } });
        const s = setup(http);
        const tracker = new PipelineRunTracker(s.api, "p-1", { ...s.options, pollMs: 60_000 });
        tracker.write("Update URL: https://h/#joblist/pipelines/p-1/updates/u-1\n");
        await expect.poll(() => tracker.data?.state).toBe("RUNNING");
        await tracker.cancel();
        expect(tracker.state).toBe("cancelled");
        expect(http.to("/api/2.0/pipelines/p-1/stop")).toHaveLength(1);
        expect(tracker.data?.state).toBe("CANCELED");
        tracker.dispose();
    });

    it("doesn't stop the pipeline when its update has already ended", async () => {
        const http = new FakeHttpClient()
            .on("GET", UPDATE, update("RUNNING"), update("COMPLETED"))
            .on("GET", "/api/2.0/pipelines/p-1/events", { body: { events: [] } });
        const s = setup(http);
        const tracker = new PipelineRunTracker(s.api, "p-1", { ...s.options, pollMs: 60_000 });
        tracker.write("Update URL: https://h/#joblist/pipelines/p-1/updates/u-1\n");
        await expect.poll(() => tracker.data?.state).toBe("RUNNING");
        await tracker.cancel();
        expect(http.to("/api/2.0/pipelines/p-1/stop")).toHaveLength(0);
        expect(tracker.state).toBe("cancelled");
        tracker.dispose();
    });
});
