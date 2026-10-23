import {ApiError} from "@databricks/sdk-core/apierror";
import {createDefault} from "@databricks/sdk-core/clientinfo";
import type {BridgedClientOptions} from "../configuration/sdkV2Bridge";
import {PromiseUtils} from "../utils";
import type {ResponsesRequest} from "./unityGatewayResponses";

const REQUEST_TAGS = JSON.stringify({source: "databricks-vscode"});

/**
 * Calls Unity Gateway's unified Responses route, which no V2 SDK client covers
 * yet. Built from the same options as V2 clients, so it authenticates and
 * connects the same way.
 */
export class UnityGatewayResponsesClient {
    private readonly userAgent: string;

    constructor(private readonly options: BridgedClientOptions) {
        this.userAgent = createDefault()
            .with({key: "auth", value: options.credentials.name()})
            .toString();
    }

    /**
     * Streams the reply's events. Rejects with an `ApiError` when the gateway
     * refuses the request.
     */
    async *createResponse(
        request: ResponsesRequest,
        signal: AbortSignal
    ): AsyncGenerator<unknown> {
        const {host, workspaceId, credentials, httpClient} = this.options;
        /* eslint-disable @typescript-eslint/naming-convention -- HTTP header names */
        const headers = new Headers({
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            "User-Agent": this.userAgent,
            "Databricks-Ai-Gateway-Request-Tags": REQUEST_TAGS,
        });
        /* eslint-enable @typescript-eslint/naming-convention */
        if (workspaceId !== undefined) {
            headers.set("X-Databricks-Workspace-Id", workspaceId);
        }
        // V2 credentials take no signal, and a v1 token refresh can hang.
        const authHeaders = await PromiseUtils.untilAborted(
            credentials.authHeaders(),
            signal
        );
        for (const {key, value} of authHeaders) {
            headers.set(key, value);
        }
        // Abort rather than cancel the body to stop reading early: v1's fetch
        // ignores cancel() and then throws on the chunks that follow.
        const stop = new AbortController();
        try {
            const response = await httpClient.send({
                url: `${host}/ai-gateway/mlflow/v1/responses`,
                method: "POST",
                headers,
                body: JSON.stringify(request),
                signal: AbortSignal.any([signal, stop.signal]),
            });
            if (response.statusCode < 200 || response.statusCode >= 300) {
                const body =
                    response.body === null
                        ? undefined
                        : new Uint8Array(
                              await new Response(response.body).arrayBuffer()
                          );
                throw ApiError.fromHttpError(
                    response.statusCode,
                    response.headers,
                    body
                );
            }
            if (response.body === null) {
                throw new Error("Unity Gateway sent an empty reply.");
            }
            yield* serverSentEvents(response.body);
        } finally {
            stop.abort();
        }
    }
}

async function* serverSentEvents(
    body: ReadableStream<Uint8Array>
): AsyncGenerator<unknown> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
        const {done, value} = await reader.read();
        buffer += decoder.decode(value, {stream: !done});
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
