import { ApiError } from "@databricks/sdk-core/apierror";
import type { ClientOptions } from "@databricks/sdk-options/client";
import { abortable } from "../../platform/timers";
import { nodeHttpClient } from "../connection/nodeHttpClient";
import { buildUserAgent } from "../connection/userAgent";

/** A reply with nothing to show: no body, or a stream that completed with no text and no tool call. */
export class EmptyReplyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "EmptyReplyError";
    }
}

/** A streaming request to the unified Responses route, with the whole conversation. */
export interface ResponsesRequest {
    model: string;
    input: ResponsesInputItem[];
    tools?: ResponsesFunctionTool[];
    tool_choice?: "auto" | "required";
    stream: true;
}

export type ResponsesInputItem =
    | { role: "user" | "assistant" | "system"; content: string }
    | { type: "function_call"; call_id: string; name: string; arguments: string }
    | { type: "function_call_output"; call_id: string; output: string };

export interface ResponsesFunctionTool {
    type: "function";
    name: string;
    description: string;
    parameters: object;
    strict: false;
}

const REQUEST_TAGS = JSON.stringify({ source: "databricks-vscode" });

/*
 * A gap client, ported from the old extension: no SDK
 * package has a route under `/ai-gateway/`, or streams. Like an SDK client it
 * is built by `ApiClients.get`, and shares the connection's host, credentials
 * and transport.
 */
export class UnityGatewayResponsesClient {
    constructor(private readonly options: ClientOptions) {}

    /**
     * `POST /ai-gateway/mlflow/v1/responses`: streams the reply's events.
     * Rejects with an `ApiError` when the gateway refuses the request.
     */
    async *createResponse(request: ResponsesRequest, signal: AbortSignal): AsyncGenerator {
        const { host, workspaceId, credentials } = this.options;
        if (host === undefined || credentials === undefined) {
            throw new Error("Host and credentials are required.");
        }
        const headers = new Headers({
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            "User-Agent": buildUserAgent(credentials),
            "Databricks-Ai-Gateway-Request-Tags": REQUEST_TAGS,
        });
        if (workspaceId !== undefined) {
            headers.set("X-Databricks-Workspace-Id", workspaceId);
        }
        signal.throwIfAborted();
        // Credentials take no signal, and getting a token can hang.
        for (const { key, value } of await abortable(credentials.authHeaders(), signal)) {
            headers.set(key, value);
        }
        // Abort rather than cancel the body to stop reading early: some transports ignore cancel().
        const stop = new AbortController();
        try {
            const response = await (this.options.httpClient ?? nodeHttpClient()).send({
                url: `${host.replace(/\/+$/, "")}/ai-gateway/mlflow/v1/responses`,
                method: "POST",
                headers,
                body: JSON.stringify(request),
                signal: AbortSignal.any([signal, stop.signal]),
            });
            if (response.statusCode < 200 || response.statusCode >= 300) {
                const body =
                    response.body === null
                        ? undefined
                        : new Uint8Array(await new Response(response.body).arrayBuffer());
                throw (
                    ApiError.fromHttpError(response.statusCode, response.headers, body) ??
                    new Error(`Unity Gateway returned HTTP ${response.statusCode}.`)
                );
            }
            if (response.body === null) {
                throw new EmptyReplyError("Unity Gateway sent an empty reply.");
            }
            yield* serverSentEvents(response.body);
        } finally {
            stop.abort();
        }
    }
}

async function* serverSentEvents(body: ReadableStream<Uint8Array>): AsyncGenerator {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const blocks = buffer.split(/\r\n\r\n|\n\n|\r\r/);
        buffer = blocks.pop()!;
        for (const block of blocks) {
            const data = blockData(block);
            if (data === "[DONE]") {
                return;
            }
            if (data !== undefined) {
                yield parseEvent(data);
            }
        }
        if (done) {
            // The stream may end mid-event, so keep a last event that has no
            // blank line after it only if it's whole.
            const event = parseWhole(blockData(buffer));
            if (event !== undefined) {
                yield event;
            }
            return;
        }
    }
}

/**
 * A block's data, or undefined if it has none. The event-stream format
 * ignores such blocks, including empty `data:` keep-alives.
 */
function blockData(block: string): string | undefined {
    const data = block
        .split(/\r\n|\r|\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).replace(/^ /, ""))
        .join("\n");
    return data === "" ? undefined : data;
}

function parseWhole(data: string | undefined): unknown {
    try {
        return data === undefined ? undefined : JSON.parse(data);
    } catch {
        return undefined;
    }
}

function parseEvent(data: string): unknown {
    try {
        return JSON.parse(data);
    } catch {
        throw new Error("Unity Gateway sent an event that isn't JSON.");
    }
}
