import type { Credentials } from "@databricks/sdk-auth";
import { ApiError } from "@databricks/sdk-core/apierror";
import { describe, expect, it } from "vitest";
import { setProduct } from "@databricks/sdk-core/clientinfo";
import { FakeHttpClient, type FakeResponse } from "../../test-support/fakeHttp";
import {
    EmptyReplyError,
    type ResponsesRequest,
    UnityGatewayResponsesClient,
} from "./UnityGatewayResponsesClient";

const HOST = "https://b.cloud.databricks.com";
const ROUTE = "/ai-gateway/mlflow/v1/responses";
const request: ResponsesRequest = {
    model: "system.ai.gpt-5",
    input: [{ role: "user", content: "Hi" }],
    stream: true,
};
const pat: Credentials = {
    name: () => "pat",
    authHeaders: async () => [{ key: "Authorization", value: "Bearer dapi-b" }],
};

const sse = (...events: unknown[]) =>
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");

function client(
    response: FakeResponse,
    options: { workspaceId?: string; credentials?: Credentials } = {},
) {
    const http = new FakeHttpClient().on("POST", ROUTE, response);
    const responses = new UnityGatewayResponsesClient({
        host: `${HOST}/`,
        credentials: options.credentials ?? pat,
        httpClient: http,
        ...(options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}),
    });
    return { http, responses };
}

async function collect(events: AsyncIterable<unknown>, limit = Infinity): Promise<unknown[]> {
    const collected: unknown[] = [];
    for await (const event of events) {
        collected.push(event);
        if (collected.length >= limit) {
            break;
        }
    }
    return collected;
}

/** The events of a reply with this status and no body at all. */
const answer = (statusCode: number) =>
    new UnityGatewayResponsesClient({
        host: HOST,
        credentials: pat,
        httpClient: { send: async () => ({ statusCode, headers: new Headers(), body: null }) },
    }).createResponse(request, new AbortController().signal);

const read = (chunks: (string | Uint8Array)[]) =>
    collect(client({ chunks }).responses.createResponse(request, new AbortController().signal));

describe("UnityGatewayResponsesClient", () => {
    it("posts the request to the Responses route with the connection's auth", async () => {
        const { http, responses } = client({
            chunks: [sse({ type: "response.completed" }), "data: [DONE]\n\n"],
        });

        expect(
            await collect(responses.createResponse(request, new AbortController().signal)),
        ).toEqual([{ type: "response.completed" }]);

        const [sent] = http.requests;
        expect(sent.method).toBe("POST");
        expect(sent.url).toBe(`${HOST}${ROUTE}`);
        expect(JSON.parse(typeof sent.body === "string" ? sent.body : "")).toEqual(request);
        expect(sent.headers.get("content-type")).toBe("application/json");
        expect(sent.headers.get("accept")).toBe("text/event-stream");
        expect(sent.headers.get("authorization")).toBe("Bearer dapi-b");
        expect(sent.headers.get("x-databricks-workspace-id")).toBeNull();
    });

    it("sends the workspace id, a User-Agent with the auth type and extension product, and the request tags", async () => {
        setProduct("databricks-vscode", "1.2.3");
        const { http, responses } = client(
            { chunks: [sse({ type: "response.completed" })] },
            { workspaceId: "1234" },
        );

        await collect(responses.createResponse(request, new AbortController().signal));

        const [{ headers }] = http.requests;
        expect(headers.get("x-databricks-workspace-id")).toBe("1234");
        const userAgent = headers.get("user-agent");
        expect(userAgent).toContain("databricks-vscode/1.2.3");
        expect(userAgent).toContain("auth/pat");
        expect(headers.get("databricks-ai-gateway-request-tags")).toBe(
            '{"source":"databricks-vscode"}',
        );
    });

    it("reads events split across chunks, line endings and data lines, skipping keep-alives", async () => {
        const accented = new TextEncoder().encode('data: {"text":"é"}\n\n');

        expect(
            await read([
                'data: {"type":"a",',
                ' "n":1}\r\n\r\ndata: {"type":"b"',
                "}\n\nevent: response.output_text.delta\n\n",
                'data: {"type":\ndata: "c"}\n\n',
                "data:\n\ndata: \n\n",
                'data: {"type":"d"}\r\r',
                // Splits the "é" between chunks.
                accented.slice(0, 16),
                accented.slice(16),
                "data: [DONE]\n\n",
                sse({ type: "after done" }),
            ]),
        ).toEqual([
            { type: "a", n: 1 },
            { type: "b" },
            { type: "c" },
            { type: "d" },
            { text: "é" },
        ]);
    });

    it("joins an event's data lines with a line break", async () => {
        // Joined without one, these lines would parse as [12].
        await expect(read(["data: [1\ndata: 2]\n\n"])).rejects.toThrow(/isn't JSON/);
    });

    it("reads to the end of a stream without [DONE]", async () => {
        expect(await read([sse({ type: "response.completed" })])).toEqual([
            { type: "response.completed" },
        ]);
    });

    it("keeps a whole last event without a blank line, and drops a cut-off one", async () => {
        expect(await read([sse({ type: "a" }), 'data: {"type":"b"}\n'])).toEqual([
            { type: "a" },
            { type: "b" },
        ]);
        expect(await read([sse({ type: "a" }), 'data: {"type":"respo'])).toEqual([{ type: "a" }]);
    });

    it("rejects a refused request with the gateway's error", async () => {
        const { responses } = client({
            status: 400,
            body: { error_code: "BAD_REQUEST", message: 'Unknown name "exclusiveMinimum"' },
        });

        const error = await collect(
            responses.createResponse(request, new AbortController().signal),
        ).then(
            () => undefined,
            (e: unknown) => e,
        );

        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({
            httpStatusCode: 400,
            code: "BAD_REQUEST",
            message: expect.stringContaining("exclusiveMinimum"),
        });
    });

    it("fails on an event that isn't JSON", async () => {
        await expect(read(["data: {oops\n\n"])).rejects.toThrow(/isn't JSON/);
    });

    it("stops the request when aborted mid-stream", async () => {
        const { http, responses } = client({
            chunks: [sse({ type: "response.created" })],
            open: true,
        });
        const controller = new AbortController();
        const events = responses.createResponse(request, controller.signal);

        expect(await events.next()).toEqual({ done: false, value: { type: "response.created" } });
        controller.abort();

        await expect(events.next()).rejects.toThrow();
        const [sent] = http.requests;
        expect(sent.signal?.aborted).toBe(true);
    });

    it("stops the request when the reader stops early", async () => {
        const { http, responses } = client({
            chunks: [sse({ type: "response.completed" }), sse({ type: "late" })],
            open: true,
        });

        expect(
            await collect(responses.createResponse(request, new AbortController().signal), 1),
        ).toEqual([{ type: "response.completed" }]);

        const [sent] = http.requests;
        expect(sent.signal?.aborted).toBe(true);
    });

    it("gives up waiting for auth when aborted, before sending anything", async () => {
        const hangs: Credentials = {
            name: () => "databricks-cli",
            authHeaders: () => new Promise(() => {}),
        };
        const { http, responses } = client({ chunks: [] }, { credentials: hangs });
        const controller = new AbortController();
        const events = responses.createResponse(request, controller.signal);

        const next = events.next();
        controller.abort();

        await expect(next).rejects.toThrow("Cancelled");
        expect(http.requests).toHaveLength(0);
    });

    it("doesn't ask for a token when already aborted", async () => {
        let asked = 0;
        const counting: Credentials = {
            name: () => "pat",
            authHeaders: async () => [{ key: "Authorization", value: `Bearer ${++asked}` }],
        };
        const { http, responses } = client({ chunks: [] }, { credentials: counting });
        const controller = new AbortController();
        controller.abort();

        await expect(responses.createResponse(request, controller.signal).next()).rejects.toThrow();
        expect(asked).toBe(0);
        expect(http.requests).toHaveLength(0);
    });

    it.each([199, 300])("rejects any status outside 2xx (%d)", async (status) => {
        const { responses } = client({ status, body: { error_code: "ERROR", message: "no" } });

        await expect(
            collect(responses.createResponse(request, new AbortController().signal)),
        ).rejects.toMatchObject({ httpStatusCode: status });
    });

    it("fails on a reply without a body, and keeps the status of a refusal without one", async () => {
        await expect(collect(answer(200))).rejects.toThrow("Unity Gateway sent an empty reply.");
        await expect(collect(answer(204))).rejects.toBeInstanceOf(EmptyReplyError);
        await expect(collect(answer(503))).rejects.toMatchObject({ httpStatusCode: 503 });
    });
});
