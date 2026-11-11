import { newPatCredentials } from "@databricks/sdk-auth/credentials";
import { JobsClient } from "@databricks/sdk-jobs/v2";
import { PipelinesClient } from "@databricks/sdk-pipelines/v2";
import { describe, expect, it } from "vitest";
import { ApiClients } from "../../../kernel/connection";
import { FakeHttpClient } from "../../../test-support/fakeHttp";
import {
    getSimplifiedJobRunState,
    getSimplifiedPipelineUpdateState,
    humaniseDuration,
    isJobRunTerminal,
    isPipelineUpdateRunning,
} from "./runState";

/* eslint-disable @typescript-eslint/naming-convention */

function api(http: FakeHttpClient) {
    return new ApiClients({
        host: "https://h.cloud.databricks.com",
        credentials: newPatCredentials("dapi-1"),
        httpClient: http,
    });
}

/** A `runs/get` response as the API sends it, read through the SDK. */
async function jobRun(state: Record<string, unknown>) {
    const http = new FakeHttpClient().on("GET", "/api/2.2/jobs/runs/get", {
        body: {
            job_id: 11,
            run_id: 931844287868435,
            run_page_url: "https://h.cloud.databricks.com/jobs/11/runs/931844287868435",
            start_time: 1759492800000,
            run_duration: 95000,
            state,
            tasks: [
                {
                    task_key: "nb",
                    run_id: 22,
                    state,
                    start_time: 1759492800000,
                    execution_duration: 4000,
                },
            ],
        },
    });
    return api(http).get(JobsClient).getRun({ runId: 931844287868435n });
}

async function pipelineUpdate(state: string) {
    const http = new FakeHttpClient().on("GET", "/api/2.0/pipelines/p/updates/u", {
        body: { update: { pipeline_id: "p", update_id: "u", state, creation_time: 1759492800000 } },
    });
    return (await api(http).get(PipelinesClient).getUpdate({ pipelineId: "p", updateId: "u" }))
        .update;
}

describe("job run states", () => {
    it.each([
        [{ life_cycle_state: "TERMINATED", result_state: "SUCCESS" }, "Success", true],
        [
            { life_cycle_state: "TERMINATED", result_state: "SUCCESS_WITH_FAILURES" },
            "Success",
            true,
        ],
        [{ life_cycle_state: "TERMINATED", result_state: "FAILED" }, "Failed", true],
        [{ life_cycle_state: "TERMINATED", result_state: "TIMEDOUT" }, "Failed", true],
        [
            { life_cycle_state: "TERMINATED", result_state: "MAXIMUM_CONCURRENT_RUNS_REACHED" },
            "Failed",
            true,
        ],
        [{ life_cycle_state: "TERMINATED", result_state: "CANCELED" }, "Cancelled", true],
        [{ life_cycle_state: "TERMINATED", result_state: "UPSTREAM_FAILED" }, "Skipped", true],
        [{ life_cycle_state: "TERMINATED", result_state: "UPSTREAM_CANCELED" }, "Skipped", true],
        [{ life_cycle_state: "TERMINATED", result_state: "EXCLUDED" }, "Skipped", true],
        [{ life_cycle_state: "TERMINATED", result_state: "DISABLED" }, "Skipped", true],
        [
            {
                life_cycle_state: "TERMINATED",
                result_state: "FAILED",
                user_cancelled_or_timedout: true,
            },
            "Cancelled",
            true,
        ],
        [{ life_cycle_state: "TERMINATED" }, "Terminated", true],
        [
            { life_cycle_state: "SKIPPED", state_message: "Skipped: concurrent run" },
            "Skipped",
            true,
        ],
        [
            { life_cycle_state: "INTERNAL_ERROR", state_message: "Cluster failed to start" },
            "Failed",
            true,
        ],
        [{ life_cycle_state: "PENDING" }, "Pending", false],
        [{ life_cycle_state: "QUEUED" }, "Pending", false],
        [{ life_cycle_state: "BLOCKED" }, "Pending", false],
        [{ life_cycle_state: "WAITING_FOR_RETRY" }, "Pending", false],
        [{ life_cycle_state: "RUNNING" }, "Running", false],
        [{ life_cycle_state: "RUNNING", user_cancelled_or_timedout: true }, "Terminating", false],
        [{ life_cycle_state: "TERMINATING" }, "Terminating", false],
        [{ life_cycle_state: "SOMETHING_NEW" }, "Unknown", false],
    ])("%j is %s", async (state, label, terminal) => {
        const run = await jobRun(state);
        expect(getSimplifiedJobRunState(run)).toBe(label);
        expect(getSimplifiedJobRunState(run.tasks![0])).toBe(label);
        expect(isJobRunTerminal(run)).toBe(terminal);
    });

    it("reads the fields the rows show, as the SDK types them", async () => {
        const run = await jobRun({ life_cycle_state: "RUNNING", state_message: "In run" });
        expect(run).toMatchObject({
            runPageUrl: "https://h.cloud.databricks.com/jobs/11/runs/931844287868435",
            startTime: 1759492800000n,
            runDuration: 95000n,
            state: { stateMessage: "In run" },
            tasks: [{ taskKey: "nb", runId: 22n, executionDuration: 4000n }],
        });
    });

    it("is Unknown without a state", () => {
        expect(getSimplifiedJobRunState(undefined)).toBe("Unknown");
        expect(getSimplifiedJobRunState({})).toBe("Unknown");
    });
});

describe("pipeline update states", () => {
    it.each([
        ["COMPLETED", "Success", false],
        ["FAILED", "Failed", false],
        ["CANCELED", "Cancelled", false],
        ["STOPPING", "Terminating", true],
        ["RUNNING", "Running", true],
        ["CREATED", "Pending", true],
        ["QUEUED", "Pending", true],
        ["INITIALIZING", "Pending", true],
        ["RESETTING", "Pending", true],
        ["SETTING_UP_TABLES", "Pending", true],
        ["WAITING_FOR_RESOURCES", "Pending", true],
    ])("%s is %s", async (state, label, running) => {
        const update = await pipelineUpdate(state);
        expect(getSimplifiedPipelineUpdateState(update)).toBe(label);
        expect(isPipelineUpdateRunning(update)).toBe(running);
    });

    it("is Unknown, and not running, without a state", () => {
        expect(getSimplifiedPipelineUpdateState(undefined)).toBe("Unknown");
        expect(isPipelineUpdateRunning({})).toBe(false);
    });
});

describe("humaniseDuration", () => {
    it("uses seconds, then minutes, then hours", () => {
        expect(humaniseDuration(undefined)).toBeUndefined();
        expect(humaniseDuration(42_900n)).toBe("42s");
        expect(humaniseDuration(90_000)).toBe("1.5m");
        expect(humaniseDuration(2.25 * 3_600_000)).toBe("2.25h");
    });
});
