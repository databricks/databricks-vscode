import { newPatCredentials } from "@databricks/sdk-auth/credentials";
import { ApiError } from "@databricks/sdk-core/apierror";
import { retryOn } from "@databricks/sdk-core/ops";
import { describe, expect, expectTypeOf, it } from "vitest";
import { FakeHttpClient } from "../../test-support/fakeHttp";
import { PipelinesClient } from "@databricks/sdk-pipelines/v2";
import type { PipelineEvent as SdkPipelineEvent } from "@databricks/sdk-pipelines/v2";
import { fakeLog } from "../../test-support/fakes";
import { ApiClients, calls, sdkLogger } from "./ApiClients";
import { listPipelineEvents } from "./pipelineEvents";

const EVENTS = "/api/2.0/pipelines/p-1/events";

function api(http: FakeHttpClient) {
    return new ApiClients({
        host: "https://a.cloud.databricks.com",
        workspaceId: "42",
        credentials: newPatCredentials("dapi-1"),
        httpClient: http,
    });
}

async function all<T>(iter: AsyncIterable<T>): Promise<T[]> {
    const items: T[] = [];
    for await (const item of iter) {
        items.push(item);
    }
    return items;
}

/* eslint-disable @typescript-eslint/naming-convention */
const RAW_DEFINITION_EVENT = {
    id: "e1",
    timestamp: "2026-10-03T12:00:00.000Z",
    message: "Dataset `test_view` defined as VIEW.",
    level: "INFO",
    event_type: "dataset_definition",
    origin: { update_id: "u-1", dataset_name: "test_view", org_id: "123456789012345678" },
    details: {
        dataset_definition: {
            dataset_type: "VIEW",
            schema: [{ name: "id", data_type: "INTEGER" }],
            num_rows: 3,
        },
    },
};
const RAW_ERROR_EVENT = {
    id: "e2",
    message: "Failed to resolve flow",
    level: "ERROR",
    error: { exceptions: [{ class_name: "AnalysisException", message: "Table not found" }] },
    origin: {
        update_id: "u-1",
        source_code_location: {
            path: "/Workspace/Users/me/.bundle/p/dev/files/src/nb",
            line_number: 3,
            notebook_cell_number: 2,
        },
    },
};
/* eslint-enable @typescript-eslint/naming-convention */

describe("listPipelineEvents", () => {
    it("patches dataset definition and source location from raw response", async () => {
        const http = new FakeHttpClient().on("GET", EVENTS, {
            text: JSON.stringify({ events: [RAW_DEFINITION_EVENT, RAW_ERROR_EVENT] }),
        });
        const events = await all(
            listPipelineEvents(api(http), { pipelineId: "p-1" }, calls.read()),
        );
        expect(events).toHaveLength(2);
        expect(events[0]).toMatchObject({
            id: "e1",
            datasetDefinition: {
                datasetType: "VIEW",
                schema: [{ name: "id", dataType: "INTEGER" }],
            },
        });
        expect(events[1]).toMatchObject({
            id: "e2",
            origin: {
                sourceCodeLocation: {
                    path: "/Workspace/Users/me/.bundle/p/dev/files/src/nb",
                    lineNumber: 3,
                    notebookCellNumber: 2,
                },
            },
        });
    });

    it("sends filter and order on page 1, only token after", async () => {
        const http = new FakeHttpClient().on(
            "GET",
            EVENTS,
            {
                text: JSON.stringify({ events: [RAW_DEFINITION_EVENT], next_page_token: "t2" }),
            },
            {
                text: JSON.stringify({ events: [RAW_ERROR_EVENT] }),
            },
        );
        const events = await all(
            listPipelineEvents(
                api(http),
                {
                    pipelineId: "p-1",
                    filter: "update_id = 'u-1'",
                    orderBy: ["timestamp asc"],
                    maxResults: 100,
                },
                calls.read(),
            ),
        );
        expect(events).toHaveLength(2);
        const [first, second] = http.to(EVENTS).map((r) => new URL(r.url).searchParams);
        expect(first!.get("filter")).toBe("update_id = 'u-1'");
        expect(first!.getAll("order_by")).toEqual(["timestamp asc"]);
        expect(first!.get("max_results")).toBe("100");
        expect([...second!.keys()].sort()).toEqual(["max_results", "page_token"]);
        expect(second!.get("page_token")).toBe("t2");
        const request = http.to(EVENTS)[0]!;
        expect(request.headers.get("Authorization")).toBe("Bearer dapi-1");
        expect(request.headers.get("X-Databricks-Workspace-Id")).toBe("42");
    });

    it("throws API errors", async () => {
        const http = new FakeHttpClient().on("GET", EVENTS, {
            status: 404,
            body: { error_code: "RESOURCE_DOES_NOT_EXIST", message: "No pipeline" },
        });
        await expect(
            all(listPipelineEvents(api(http), { pipelineId: "p-1" })),
        ).rejects.toBeInstanceOf(ApiError);
    });

    it("retries 503 with read policy", async () => {
        const http = new FakeHttpClient().on(
            "GET",
            EVENTS,
            {
                status: 503,
                body: { message: "busy" },
            },
            {
                text: JSON.stringify({ events: [RAW_DEFINITION_EVENT] }),
            },
        );
        const events = await all(
            listPipelineEvents(
                api(http),
                { pipelineId: "p-1" },
                calls.read({ backoff: { initial: 1, maximum: 1 } }),
            ),
        );
        expect(events.map((e) => e.datasetDefinition?.datasetType)).toEqual(["VIEW"]);
        expect(http.to(EVENTS)).toHaveLength(2);
    });

    it("drops only a malformed undocumented field", async () => {
        const malformed = {
            ...RAW_ERROR_EVENT,
            details: { dataset_definition: { dataset_type: "VIEW", schema: "not a list" } },
        };
        const http = new FakeHttpClient().on("GET", EVENTS, {
            text: JSON.stringify({ events: [malformed, RAW_DEFINITION_EVENT] }),
        });
        const [first, second] = await all(listPipelineEvents(api(http), { pipelineId: "p-1" }));
        expect(first!.datasetDefinition).toBeUndefined();
        expect(first!.origin?.sourceCodeLocation?.lineNumber).toBe(3);
        expect(second!.datasetDefinition?.datasetType).toBe("VIEW");
    });

    it("leaves an event without the fields as the SDK read it", async () => {
        const plain = { id: "e3", message: "Update started", level: "INFO" };
        const http = new FakeHttpClient().on("GET", EVENTS, {
            text: JSON.stringify({ events: [plain] }),
        });
        const [only] = await all(listPipelineEvents(api(http), { pipelineId: "p-1" }));
        expect(only!.message).toBe("Update started");
        expect(only!.origin).toBeUndefined();
        expect(only!.datasetDefinition).toBeUndefined();
    });

    it("yields nothing for a pipeline with no events", async () => {
        const http = new FakeHttpClient().on("GET", EVENTS, { text: "{}" });
        expect(await all(listPipelineEvents(api(http), { pipelineId: "p-1" }))).toEqual([]);
    });

    it("drops a source location or a column of the wrong type", async () => {
        const event = {
            ...RAW_ERROR_EVENT,
            origin: { update_id: "u-1", source_code_location: { path: 42 } },
            details: { dataset_definition: { dataset_type: "VIEW", schema: [{ name: 1 }] } },
        };
        const http = new FakeHttpClient().on("GET", EVENTS, {
            text: JSON.stringify({ events: [event] }),
        });
        const [only] = await all(listPipelineEvents(api(http), { pipelineId: "p-1" }));
        expect(only!.origin?.updateId).toBe("u-1");
        expect(only!.origin?.sourceCodeLocation).toBeUndefined();
        expect(only!.datasetDefinition).toBeUndefined();
    });

    it("gives each of two concurrent listings its own events", async () => {
        const other = { ...RAW_DEFINITION_EVENT, id: "o1", origin: { update_id: "u-2" } };
        const http = new FakeHttpClient()
            .on("GET", EVENTS, { text: JSON.stringify({ events: [RAW_DEFINITION_EVENT] }) })
            .on("GET", "/api/2.0/pipelines/p-2/events", {
                text: JSON.stringify({
                    events: [
                        { ...other, details: { dataset_definition: { dataset_type: "TABLE" } } },
                    ],
                }),
            });
        const clients = api(http);
        const [p1, p2] = await Promise.all([
            all(listPipelineEvents(clients, { pipelineId: "p-1" })),
            all(listPipelineEvents(clients, { pipelineId: "p-2" })),
        ]);
        expect(p1.map((e) => [e.id, e.datasetDefinition?.datasetType])).toEqual([["e1", "VIEW"]]);
        expect(p2.map((e) => [e.id, e.datasetDefinition?.datasetType])).toEqual([["o1", "TABLE"]]);
    });

    it("attaches nothing to an event without an ID", async () => {
        const http = new FakeHttpClient().on("GET", EVENTS, {
            text: JSON.stringify({
                events: [{ ...RAW_ERROR_EVENT, id: undefined }, RAW_DEFINITION_EVENT],
            }),
        });
        const [first, second] = await all(listPipelineEvents(api(http), { pipelineId: "p-1" }));
        expect(first!.message).toBe("Failed to resolve flow");
        expect(first!.origin?.sourceCodeLocation).toBeUndefined();
        expect(second!.datasetDefinition?.datasetType).toBe("VIEW");
    });

    it("drops the fields when one call got two successful responses", async () => {
        const http = new FakeHttpClient().on(
            "GET",
            EVENTS,
            { text: "not JSON" },
            { text: JSON.stringify({ events: [RAW_DEFINITION_EVENT] }) },
        );
        let failures = 0;
        const events = await all(
            listPipelineEvents(
                api(http),
                { pipelineId: "p-1" },
                { retrier: () => retryOn({ initial: 1, maximum: 1 }, () => ++failures === 1) },
            ),
        );
        expect(events.map((e) => [e.id, e.datasetDefinition])).toEqual([["e1", undefined]]);
        expect(http.to(EVENTS)).toHaveLength(2);
    });

    it("logs each response's status, not its body", async () => {
        const log = fakeLog();
        const http = new FakeHttpClient().on("GET", EVENTS, {
            text: JSON.stringify({ events: [RAW_DEFINITION_EVENT] }),
        });
        const clients = new ApiClients({
            host: "https://a.cloud.databricks.com",
            credentials: newPatCredentials("dapi-1"),
            logger: sdkLogger(log),
            httpClient: http,
        });
        await all(listPipelineEvents(clients, { pipelineId: "p-1" }));
        const response = log.entries.find((e) => e.message === "HTTP response");
        expect(response?.data).toEqual([{ statusCode: 200 }]);
        expect(JSON.stringify(log.entries)).not.toContain("test_view");
    });

    it("is needed while the SDK declares neither field", () => {
        // When this stops typechecking, the SDK reads the field itself: drop the raw read.
        expectTypeOf<NonNullable<SdkPipelineEvent["origin"]>>().not.toHaveProperty(
            "sourceCodeLocation",
        );
        expectTypeOf<SdkPipelineEvent>().not.toHaveProperty("details");
        expectTypeOf<SdkPipelineEvent>().not.toHaveProperty("datasetDefinition");
    });

    it("fresh wraps the SDK's own transport when the connection has none", () => {
        const clients = new ApiClients({
            host: "https://a.cloud.databricks.com",
            credentials: newPatCredentials("dapi-1"),
        });
        let wrapped: unknown;
        clients.fresh(PipelinesClient, (transport) => {
            wrapped = transport;
            return transport;
        });
        expect(typeof (wrapped as { send?: unknown } | undefined)?.send).toBe("function");
    });
});
