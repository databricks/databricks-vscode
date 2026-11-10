import type { HttpClient, HttpRequest, HttpResponse } from "@databricks/sdk-core/http";

export interface FakeResponse {
    readonly status?: number;
    readonly body?: unknown;
    /** A raw body instead of `body`, sent as it is: for one that isn't JSON, such as a proxy's HTML page. */
    readonly text?: string;
    readonly headers?: Record<string, string>;
    /** A streamed body instead of `body`, one chunk per read; aborting the request errors it, as `fetch` does. */
    readonly chunks?: readonly (string | Uint8Array)[];
    /** Keeps a streamed body open after its chunks, as a server still writing. */
    readonly open?: boolean;
    /** No body at all, as `fetch` gives for a 204. */
    readonly noBody?: boolean;
}

/**
 * A request that never reached the host, as `fetch` rejects it: a bare
 * "fetch failed", with the reason's code on its `cause`.
 */
export function fetchFailed(code: string, host = "a.cloud.databricks.com"): TypeError {
    const cause = Object.assign(new Error(`getaddrinfo ${code} ${host}`), { code });
    return new TypeError("fetch failed", { cause });
}

type Handler = FakeResponse | ((request: HttpRequest) => FakeResponse | Promise<FakeResponse>);

/**
 * An SDK `HttpClient` with scripted responses, keyed by method and path.
 * A route can hold a queue, which is consumed in order and then repeats
 * its last response. Unrouted requests get a 404.
 */
export class FakeHttpClient implements HttpClient {
    readonly requests: HttpRequest[] = [];
    private readonly routes = new Map<string, Handler[]>();
    private readonly prefixes: { method: string; prefix: string; handler: Handler }[] = [];

    on(method: string, path: string, ...responses: Handler[]): this {
        this.routes.set(`${method} ${path}`, responses);
        return this;
    }

    /** Answers every `method` request under `prefix` that has no exact route. */
    onPrefix(method: string, prefix: string, handler: Handler): this {
        this.prefixes.push({ method, prefix, handler });
        return this;
    }

    /** The requests to `path`. */
    to(path: string): HttpRequest[] {
        return this.requests.filter((r) => new URL(r.url).pathname === path);
    }

    async send(request: HttpRequest): Promise<HttpResponse> {
        this.requests.push(request);
        const url = new URL(request.url);
        const queue = this.routes.get(`${request.method} ${url.pathname}`);
        const handler =
            (queue && (queue.length > 1 ? queue.shift()! : queue[0])) ??
            this.prefixes.find(
                (p) => p.method === request.method && url.pathname.startsWith(p.prefix),
            )?.handler;
        const response =
            handler === undefined
                ? {
                      status: 404,
                      body: { error_code: "NOT_FOUND", message: `No route for ${url.pathname}` },
                  }
                : typeof handler === "function"
                  ? await handler(request)
                  : handler;
        if (response.noBody === true) {
            return { statusCode: response.status ?? 200, headers: new Headers(), body: null };
        }
        if (response.chunks !== undefined) {
            return {
                statusCode: response.status ?? 200,
                headers: new Headers({ "content-type": "text/event-stream", ...response.headers }),
                body: chunkStream(response.chunks, response.open ?? false, request.signal),
            };
        }
        const text =
            response.text ?? (response.body === undefined ? "" : JSON.stringify(response.body));
        return {
            statusCode: response.status ?? 200,
            headers: new Headers({ "content-type": "application/json", ...response.headers }),
            body: new Response(text).body,
        };
    }
}

function chunkStream(
    chunks: readonly (string | Uint8Array)[],
    open: boolean,
    signal: AbortSignal | undefined,
): ReadableStream<Uint8Array> {
    const queue = [...chunks];
    let closed = false;
    return new ReadableStream<Uint8Array>({
        start(controller) {
            signal?.addEventListener(
                "abort",
                () => {
                    if (!closed) {
                        controller.error(signal.reason);
                    }
                },
                { once: true },
            );
        },
        pull(controller) {
            const chunk = queue.shift();
            if (chunk !== undefined) {
                controller.enqueue(
                    typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk,
                );
            } else if (!open) {
                closed = true;
                controller.close();
            }
        },
    });
}

export const SCIM_ME = "/api/2.0/preview/scim/v2/Me";
