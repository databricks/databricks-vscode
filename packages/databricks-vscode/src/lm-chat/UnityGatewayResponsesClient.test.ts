/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import http from "node:http";
import type {AddressInfo} from "node:net";
import {ApiClient, Config} from "@databricks/sdk-experimental";
import {ApiError} from "@databricks/sdk-core/apierror";
import type {HttpResponse} from "@databricks/sdk-core/http";
import {anything, instance, mock, when} from "ts-mockito";
import {v2ClientOptions} from "../configuration/sdkV2Bridge";
import type {ResponsesRequest} from "./unityGatewayResponses";
import {UnityGatewayResponsesClient} from "./UnityGatewayResponsesClient";

const request: ResponsesRequest = {
    model: "system.ai.gpt-5",
    input: [{role: "user", content: "Hi"}],
    stream: true,
};

async function collect(
    events: AsyncIterable<unknown>,
    limit = Infinity
): Promise<unknown[]> {
    const collected: unknown[] = [];
    for await (const event of events) {
        collected.push(event);
        if (collected.length >= limit) {
            break;
        }
    }
    return collected;
}

describe(__filename, () => {
    let mockConfig: Config;
    let server: http.Server;
    let host: URL;
    let handle: (response: http.ServerResponse) => void;
    let received: {
        method?: string;
        url?: string;
        headers: http.IncomingHttpHeaders;
        body: string;
    }[];
    let connections: number;
    let closedEarly: Promise<void>;
    let onClosedEarly: () => void;

    class CountingAgent extends http.Agent {
        createConnection(...args: Parameters<http.Agent["createConnection"]>) {
            connections++;
            return super.createConnection(...args);
        }
    }

    /** A v1 client with the product createWorkspaceClient sets. */
    function apiClient() {
        return new ApiClient(instance(mockConfig), {
            product: "databricks-vscode",
            productVersion: "1.2.3",
        });
    }

    function newClient(
        options = v2ClientOptions(apiClient(), host, new CountingAgent())
    ) {
        return new UnityGatewayResponsesClient(options);
    }

    /** A client whose transport answers with these body chunks, one per read. */
    function scriptedClient(chunks: (string | Uint8Array)[]) {
        return newClient({
            ...v2ClientOptions(apiClient(), host, new http.Agent()),
            httpClient: {
                send: async (): Promise<HttpResponse> => ({
                    statusCode: 200,
                    headers: new Headers({"content-type": "text/event-stream"}),
                    body: new ReadableStream({
                        pull(controller) {
                            const chunk = chunks.shift();
                            if (chunk === undefined) {
                                controller.close();
                            } else {
                                controller.enqueue(
                                    typeof chunk === "string"
                                        ? new TextEncoder().encode(chunk)
                                        : chunk
                                );
                            }
                        },
                    }),
                }),
            },
        });
    }

    function sse(...events: unknown[]) {
        return events
            .map((event) => `data: ${JSON.stringify(event)}\n\n`)
            .join("");
    }

    beforeEach(async () => {
        mockConfig = mock(Config);
        when(mockConfig.authType).thenReturn("azure-cli");
        when(mockConfig.workspaceId).thenReturn(undefined);
        when(mockConfig.authenticate(anything())).thenCall(
            async (headers: Headers) => {
                headers.set("Authorization", "Bearer v1-token");
            }
        );
        received = [];
        connections = 0;
        closedEarly = new Promise((resolve) => (onClosedEarly = resolve));
        handle = (response) => {
            response.writeHead(200, {"content-type": "text/event-stream"});
            response.end(
                sse({type: "response.completed"}) + "data: [DONE]\n\n"
            );
        };
        server = http.createServer((req, response) => {
            let body = "";
            req.on("data", (chunk) => (body += chunk));
            req.on("end", () => {
                received.push({
                    method: req.method,
                    url: req.url,
                    headers: req.headers,
                    body,
                });
                response.on("close", () => {
                    if (!response.writableEnded) {
                        onClosedEarly();
                    }
                });
                handle(response);
            });
        });
        await new Promise<void>((resolve) =>
            server.listen(0, "127.0.0.1", resolve)
        );
        host = new URL(
            `http://127.0.0.1:${(server.address() as AddressInfo).port}`
        );
    });

    afterEach(async () => {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    });

    it("posts the request to the Responses route through the agent, with v1 auth", async () => {
        const events = await collect(
            newClient().createResponse(request, new AbortController().signal)
        );

        assert.deepStrictEqual(events, [{type: "response.completed"}]);
        assert.equal(connections, 1);
        const [sent] = received;
        assert.equal(sent.method, "POST");
        assert.equal(sent.url, "/ai-gateway/mlflow/v1/responses");
        assert.deepStrictEqual(JSON.parse(sent.body), request);
        assert.equal(sent.headers["content-type"], "application/json");
        assert.equal(sent.headers.accept, "text/event-stream");
        assert.equal(sent.headers.authorization, "Bearer v1-token");
        assert.equal(sent.headers["x-databricks-workspace-id"], undefined);
    });

    it("sends the workspace id, the v1 client's User-Agent and the request tags", async () => {
        when(mockConfig.workspaceId).thenReturn("1234");

        await collect(
            newClient().createResponse(request, new AbortController().signal)
        );

        const {headers} = received[0];
        assert.equal(headers["x-databricks-workspace-id"], "1234");
        assert.ok(
            headers["user-agent"]?.includes("databricks-vscode/1.2.3"),
            headers["user-agent"]
        );
        assert.ok(headers["user-agent"]?.includes("auth/azure-cli"));
        assert.equal(
            headers["databricks-ai-gateway-request-tags"],
            '{"source":"databricks-vscode"}'
        );
    });

    it("reads events split across chunks, line endings and data lines, skipping keep-alives", async () => {
        const accented = new TextEncoder().encode('data: {"text":"é"}\n\n');
        const events = await collect(
            scriptedClient([
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
                sse({type: "after done"}),
            ]).createResponse(request, new AbortController().signal)
        );

        assert.deepStrictEqual(events, [
            {type: "a", n: 1},
            {type: "b"},
            {type: "c"},
            {type: "d"},
            {text: "é"},
        ]);
    });

    it("joins an event's data lines with a line break", async () => {
        // Joined without one, these lines would parse as [12].
        await assert.rejects(
            collect(
                scriptedClient(["data: [1\ndata: 2]\n\n"]).createResponse(
                    request,
                    new AbortController().signal
                )
            ),
            /isn't JSON/
        );
    });

    it("reads to the end of a stream without [DONE]", async () => {
        const events = await collect(
            scriptedClient([sse({type: "response.completed"})]).createResponse(
                request,
                new AbortController().signal
            )
        );

        assert.deepStrictEqual(events, [{type: "response.completed"}]);
    });

    it("keeps a whole last event without a blank line, and drops a cut-off one", async () => {
        const read = (chunks: string[]) =>
            collect(
                scriptedClient(chunks).createResponse(
                    request,
                    new AbortController().signal
                )
            );

        assert.deepStrictEqual(
            await read([sse({type: "a"}), 'data: {"type":"b"}\n']),
            [{type: "a"}, {type: "b"}]
        );
        assert.deepStrictEqual(
            await read([sse({type: "a"}), 'data: {"type":"respo']),
            [{type: "a"}]
        );
    });

    it("rejects a refused request with the gateway's error", async () => {
        handle = (response) => {
            response.writeHead(400, {"content-type": "application/json"});
            response.end(
                JSON.stringify({
                    error_code: "BAD_REQUEST",
                    message: 'Unknown name "exclusiveMinimum"',
                })
            );
        };

        await assert.rejects(
            collect(
                newClient().createResponse(
                    request,
                    new AbortController().signal
                )
            ),
            (e: unknown) =>
                e instanceof ApiError &&
                e.httpStatusCode === 400 &&
                e.code === "BAD_REQUEST" &&
                e.message.includes("exclusiveMinimum")
        );
    });

    it("fails on an event that isn't JSON", async () => {
        await assert.rejects(
            collect(
                scriptedClient(["data: {oops\n\n"]).createResponse(
                    request,
                    new AbortController().signal
                )
            ),
            /isn't JSON/
        );
    });

    it("closes the connection when aborted mid-stream", async () => {
        handle = (response) => {
            response.writeHead(200, {"content-type": "text/event-stream"});
            response.write(sse({type: "response.created"}));
        };
        const controller = new AbortController();
        const events = newClient().createResponse(request, controller.signal);

        assert.deepStrictEqual(await events.next(), {
            done: false,
            value: {type: "response.created"},
        });
        controller.abort();

        await assert.rejects(events.next());
        await closedEarly;
    });

    it("closes the connection when the reader stops early", async () => {
        handle = (response) => {
            response.writeHead(200, {"content-type": "text/event-stream"});
            response.write(sse({type: "response.completed"}));
            // The rest of the stream keeps coming after the reader stops.
            const more = setInterval(
                () => response.write(sse({type: "late"})),
                10
            );
            response.on("close", () => clearInterval(more));
        };

        const events = await collect(
            newClient().createResponse(request, new AbortController().signal),
            1
        );

        assert.deepStrictEqual(events, [{type: "response.completed"}]);
        await closedEarly;
    });

    it("gives up waiting for auth when aborted", async () => {
        when(mockConfig.authenticate(anything())).thenReturn(
            new Promise(() => {})
        );
        const controller = new AbortController();
        const events = newClient().createResponse(request, controller.signal);

        const next = events.next();
        controller.abort(new Error("cancelled"));

        await assert.rejects(next, /cancelled/);
        assert.equal(received.length, 0);
    });
});
