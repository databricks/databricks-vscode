import { newPatCredentials } from "@databricks/sdk-auth/credentials";
import { describe, expect, it } from "vitest";
import { ApiClients, type PipelineEvent } from "../../../kernel/connection";
import { FakeHttpClient } from "../../../test-support/fakeHttp";
import {
    extractPipelineDatasets,
    getEventMessage,
    PipelineDatasets,
    type PipelineRun,
} from "./pipelineDatasets";

const defined = (
    name: string,
    datasetType?: string,
    schema?: { name?: string; dataType?: string }[],
): PipelineEvent => ({
    origin: { datasetName: name },
    datasetDefinition: { datasetType, schema },
});
const notADataset: PipelineEvent = { origin: { updateId: "u" } };

// Ported from the old `BundlePipelinesManager.test.ts`.
describe("extractPipelineDatasets", () => {
    it("collects datasets from the runs, back to the latest full graph update", () => {
        const runs: PipelineRun[] = [
            {
                data: { creationTime: 10n },
                events: [
                    defined("table1", "TABLE"),
                    notADataset,
                    defined("table2", "TABLE"),
                    defined("table2.5", "VIEW"),
                ],
            },
        ];
        expect([...extractPipelineDatasets(runs).datasets].sort()).toEqual(["table1", "table2"]);

        // A partial update adds to what earlier runs found.
        runs.push({
            data: { creationTime: 100n, refreshSelection: ["table3", "table4"] },
            events: [defined("table3", "TABLE"), notADataset, defined("table4", "TABLE")],
        });
        expect([...extractPipelineDatasets(runs).datasets].sort()).toEqual([
            "table1",
            "table2",
            "table3",
            "table4",
        ]);

        // So does a full graph update that hasn't completed.
        runs.push({
            data: { creationTime: 200n, refreshSelection: [], state: "RUNNING" },
            events: [defined("table_new", "TABLE"), notADataset, defined("table_final", "TABLE")],
        });
        expect(extractPipelineDatasets(runs).datasets.size).toBe(6);

        // A completed one replaces them.
        runs.push({
            data: { creationTime: 300n, refreshSelection: [], state: "COMPLETED" },
            events: [defined("table_new", "TABLE"), notADataset, defined("table_final", "TABLE")],
        });
        expect([...extractPipelineDatasets(runs).datasets].sort()).toEqual([
            "table_final",
            "table_new",
        ]);
    });

    it("extracts the schemas, with the type of the event that carried them", () => {
        const { schemas } = extractPipelineDatasets([
            {
                data: { creationTime: 10n },
                events: [
                    defined("table1", "TABLE", [
                        { name: "col1", dataType: "STRING" },
                        { name: "col2" },
                    ]),
                    notADataset,
                    defined("table2", "TABLE", []),
                    defined("table3", "VIEW", [{ name: "col1", dataType: "STRING" }]),
                ],
            },
        ]);
        expect([...schemas.keys()]).toEqual(["table1", "table3"]);
        expect(schemas.get("table1")).toEqual({
            name: "table1",
            type: "TABLE",
            schema: [
                { name: "col1", type: "STRING" },
                { name: "col2", type: "" },
            ],
        });
        expect(schemas.get("table3")).toEqual({
            name: "table3",
            type: "VIEW",
            schema: [{ name: "col1", type: "STRING" }],
        });
    });

    it("keeps the old rule: a materialized view's schema event has no type, so its description is empty", () => {
        const { datasets, schemas } = extractPipelineDatasets([
            {
                data: { creationTime: 10n, state: "COMPLETED" },
                events: [
                    defined("test_view", "VIEW", [{ name: "1", dataType: "INTEGER" }]),
                    defined("vscode_integration_test.test_table", "MATERIALIZED_VIEW"),
                    defined("vscode_integration_test.test_table", undefined, [
                        { name: "1", dataType: "INTEGER" },
                    ]),
                ],
            },
        ]);
        expect([...datasets]).toEqual(["vscode_integration_test.test_table"]);
        expect(schemas.get("test_view")?.type).toBe("VIEW");
        expect(schemas.get("vscode_integration_test.test_table")?.type).toBe("");
    });
});

describe("getEventMessage", () => {
    it("adds the exceptions' messages", () => {
        expect(getEventMessage({ message: "Update failed" })).toBe("Update failed");
        expect(
            getEventMessage({
                message: "Update failed",
                error: { exceptions: [{ message: "Table not found" }, { className: "X" }] },
            }),
        ).toBe("Update failed\nTable not found");
    });
});

describe("PipelineDatasets", () => {
    /* eslint-disable @typescript-eslint/naming-convention */
    const UPDATES = {
        updates: [
            { update_id: "u2", state: "COMPLETED", creation_time: 2000, refresh_selection: ["t2"] },
            { update_id: "u1", state: "COMPLETED", creation_time: 1000 },
        ],
    };
    const EVENTS = {
        events: [
            {
                id: "e1",
                origin: { update_id: "u1", dataset_name: "t1" },
                details: {
                    dataset_definition: {
                        dataset_type: "TABLE",
                        schema: [{ name: "a", data_type: "INT" }],
                    },
                },
            },
            {
                id: "e2",
                origin: { update_id: "u2", dataset_name: "t2" },
                details: {
                    dataset_definition: {
                        dataset_type: "TABLE",
                        schema: [{ name: "b", data_type: "INT" }],
                    },
                },
            },
            {
                id: "e3",
                origin: { update_id: "elsewhere", dataset_name: "t3" },
                details: { dataset_definition: { dataset_type: "TABLE" } },
            },
        ],
    };
    /* eslint-enable @typescript-eslint/naming-convention */

    function setup(http: FakeHttpClient) {
        const api = new ApiClients({
            host: "https://h",
            credentials: newPatCredentials("dapi-1"),
            httpClient: http,
        });
        return new PipelineDatasets(
            () => [],
            () => api,
        );
    }

    it("preloads the last three updates' datasets once, from their creation on", async () => {
        const http = new FakeHttpClient()
            .on("GET", "/api/2.0/pipelines/p-1/updates", { body: UPDATES })
            .on("GET", "/api/2.0/pipelines/p-1/events", { body: EVENTS });
        const datasets = setup(http);
        const state = await datasets.preload("pipelines.p", "p-1");
        expect([...state!.schemas.keys()].sort()).toEqual(["t1", "t2"]);
        await datasets.preload("pipelines.p", "p-1");
        expect(http.to("/api/2.0/pipelines/p-1/updates")).toHaveLength(1);
        const updates = new URL(http.to("/api/2.0/pipelines/p-1/updates")[0]!.url).searchParams;
        expect(updates.get("max_results")).toBe("3");
        const events = new URL(http.to("/api/2.0/pipelines/p-1/events")[0]!.url).searchParams;
        expect(events.get("filter")).toBe("timestamp >= '1970-01-01T00:00:01.000Z'");
        expect(events.getAll("order_by")).toEqual(["timestamp asc"]);
    });

    it("loads again after a clear", async () => {
        const http = new FakeHttpClient()
            .on("GET", "/api/2.0/pipelines/p-1/updates", { body: UPDATES })
            .on("GET", "/api/2.0/pipelines/p-1/events", { body: EVENTS });
        const datasets = setup(http);
        await datasets.preload("pipelines.p", "p-1");
        datasets.clear();
        await datasets.preload("pipelines.p", "p-1");
        expect(http.to("/api/2.0/pipelines/p-1/updates")).toHaveLength(2);
    });

    it("tries a failed preload again", async () => {
        const http = new FakeHttpClient().on(
            "GET",
            "/api/2.0/pipelines/p-1/updates",
            { status: 400, body: { message: "bad" } },
            { body: UPDATES },
        );
        http.on("GET", "/api/2.0/pipelines/p-1/events", { body: EVENTS });
        const datasets = setup(http);
        await expect(datasets.preload("pipelines.p", "p-1")).rejects.toThrow("bad");
        expect((await datasets.preload("pipelines.p", "p-1"))?.schemas.size).toBe(2);
    });
});
