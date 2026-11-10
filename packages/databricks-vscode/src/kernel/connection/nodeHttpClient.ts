import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { pipeline, Readable } from "node:stream";
import zlib from "node:zlib";
import type { HttpClient, HttpRequest, HttpResponse } from "@databricks/sdk-core/http";

export interface NodeHttpClientOptions {
    /**
     * Read for each request, so a change to `http.proxyStrictSSL` applies to
     * the next call. Defaults to verifying certificates.
     */
    readonly rejectUnauthorized?: () => boolean;
}

/**
 * The transport for in-process calls: `node:https` and `node:http` `request`,
 * as 2.22.0 used. VS Code patches `request` to route through the proxy
 * settings and to trust the OS certificates, so the request passes neither an
 * `agent` nor a `ca`. VS Code patches fetch too, and a proxy and the OS
 * certificates work there, but fetch ignores `http.proxyStrictSSL`, and with
 * `http.systemCertificates` on it doesn't trust `NODE_EXTRA_CA_CERTS`.
 *
 * It follows fetch's rules for redirects and for `Authorization` and `Cookie`
 * on a cross-origin hop. It doesn't send `Accept-Encoding` (2.22.0 didn't),
 * but it decodes a compressed response anyway. Errors reject with Node's own
 * error, code included, for the SDK's retrier to classify.
 */
export function nodeHttpClient(options: NodeHttpClientOptions = {}): HttpClient {
    const rejectUnauthorized = options.rejectUnauthorized ?? (() => true);
    return {
        async send(request) {
            const { signal } = request;
            if (signal?.aborted) {
                throw abortReason(signal);
            }
            const headers: Record<string, string> = {};
            request.headers.forEach((value, key) => {
                headers[key] = value;
            });
            let payload = payloadOf(request.body, headers);
            let url = new URL(request.url);
            let method = request.method.toUpperCase();
            for (let hops = 0; ; hops++) {
                // An abort that lands between two hops must stop the next one: its listener is gone.
                if (signal?.aborted) {
                    throw abortReason(signal);
                }
                const res = await open({
                    url,
                    method,
                    headers,
                    payload,
                    signal,
                    rejectUnauthorized: rejectUnauthorized(),
                });
                const location = res.headers.location;
                if (!REDIRECT_STATUSES.has(res.statusCode ?? 0) || location === undefined) {
                    return toResponse(res, signal, method !== "HEAD");
                }
                res.resume();
                if (hops >= MAX_REDIRECTS) {
                    throw new TypeError("redirect count exceeded");
                }
                const next = new URL(location, url);
                const status = res.statusCode ?? 0;
                if ((status === 303 && method !== "HEAD") || (status < 304 && method === "POST")) {
                    method = "GET";
                    payload = null;
                    for (const name of BODY_HEADERS) {
                        delete headers[name];
                    }
                } else if (payload?.stream !== undefined) {
                    // A stream can't be sent again, so it can't follow a 307 or 308.
                    throw new TypeError("cannot follow a redirect with a streamed body");
                }
                if (next.origin !== url.origin) {
                    delete headers.authorization;
                    delete headers.cookie;
                }
                url = next;
            }
        },
    };
}

const MAX_REDIRECTS = 20;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/** The headers that describe a body, which a redirect to a GET drops. */
const BODY_HEADERS = [
    "content-type",
    "content-length",
    "content-encoding",
    "content-language",
    "content-location",
    "transfer-encoding",
];

interface Payload {
    readonly buffer?: Buffer;
    readonly stream?: Readable;
}

/** The request body as Node sends it. A string gets fetch's default Content-Type when it has none. */
function payloadOf(body: HttpRequest["body"], headers: Record<string, string>): Payload | null {
    if (body === undefined || body === null) {
        return null;
    }
    if (typeof body === "string") {
        headers["content-type"] ??= "text/plain;charset=UTF-8";
        return { buffer: Buffer.from(body) };
    }
    if (body instanceof ArrayBuffer) {
        return { buffer: Buffer.from(body) };
    }
    if (body instanceof ReadableStream) {
        return { stream: Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]) };
    }
    return { buffer: Buffer.from(body.buffer, body.byteOffset, body.byteLength) };
}

interface Attempt {
    readonly url: URL;
    readonly method: string;
    readonly headers: Record<string, string>;
    readonly payload: Payload | null;
    readonly signal: AbortSignal | undefined;
    readonly rejectUnauthorized: boolean;
}

/** One request, without following redirects. Resolves with the response once its headers arrive. */
function open(attempt: Attempt): Promise<IncomingMessage> {
    const { url, method, headers, payload, signal } = attempt;
    if (payload?.buffer !== undefined) {
        headers["content-length"] ??= String(payload.buffer.length);
    } else if (payload?.stream !== undefined) {
        // Node frames no body for a DELETE that has no length, so say it's chunked.
        headers["transfer-encoding"] ??= "chunked";
    }
    return new Promise((resolve, reject) => {
        const onResponse = (res: IncomingMessage) => {
            signal?.removeEventListener("abort", onAbort);
            resolve(res);
        };
        const req =
            url.protocol === "https:"
                ? https.request(
                      url,
                      { method, headers, rejectUnauthorized: attempt.rejectUnauthorized },
                      onResponse,
                  )
                : http.request(url, { method, headers }, onResponse);
        const onAbort = () => req.destroy(abortReason(signal));
        req.on("error", (error) => {
            signal?.removeEventListener("abort", onAbort);
            reject(error);
        });
        signal?.addEventListener("abort", onAbort, { once: true });
        if (payload === null) {
            req.end();
        } else if (payload.buffer !== undefined) {
            req.end(payload.buffer);
        } else {
            // A failed body destroys the request, which rejects the promise.
            pipeline(payload.stream!, req, () => {});
        }
    });
}

/** The response as fetch gives it: multi-value headers kept, and a compressed body decoded. */
function toResponse(
    res: IncomingMessage,
    signal: AbortSignal | undefined,
    mayHaveBody: boolean,
): HttpResponse {
    const headers = new Headers();
    for (let i = 0; i < res.rawHeaders.length; i += 2) {
        headers.append(res.rawHeaders[i], res.rawHeaders[i + 1]);
    }
    const encoding = (res.headers["content-encoding"] ?? "").trim().toLowerCase();
    // A response with no body, such as a 204 or 304, has nothing to decode.
    const hasBody = mayHaveBody && res.statusCode !== 204 && res.statusCode !== 304;
    // Flushed as fetch flushes, so an empty or cut-off body gives what it holds instead of Z_BUF_ERROR.
    const flush = { flush: zlib.constants.Z_SYNC_FLUSH, finishFlush: zlib.constants.Z_SYNC_FLUSH };
    const decoder = !hasBody
        ? undefined
        : encoding === "gzip" || encoding === "x-gzip"
          ? zlib.createGunzip(flush)
          : encoding === "deflate"
            ? zlib.createInflate(flush)
            : encoding === "br"
              ? zlib.createBrotliDecompress({
                    flush: zlib.constants.BROTLI_OPERATION_FLUSH,
                    finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH,
                })
              : undefined;
    // pipeline forwards a failure of the response (a reset, a premature close) to the decoder, so the web stream errors.
    const body = decoder === undefined ? res : pipeline(res, decoder, () => {});
    // Wired before any abort: a stream destroyed first would close, not error.
    const web = Readable.toWeb(body) as ReadableStream<Uint8Array>;
    body.on("error", () => {});
    if (signal?.aborted) {
        // Aborted after the headers arrived, before the body was wired.
        body.destroy(abortReason(signal));
    } else if (signal !== undefined) {
        const onAbort = () => body.destroy(abortReason(signal));
        signal.addEventListener("abort", onAbort, { once: true });
        res.once("close", () => signal.removeEventListener("abort", onAbort));
    }
    return {
        statusCode: res.statusCode ?? 0,
        headers,
        body: web,
    };
}

function abortError(): DOMException {
    return new DOMException("This operation was aborted", "AbortError");
}

/**
 * The reason the signal was aborted with, as fetch rejects with it: a timeout
 * stays a TimeoutError, and so is not taken for a cancellation.
 */
function abortReason(signal: AbortSignal | undefined): Error {
    return signal?.reason instanceof Error ? signal.reason : abortError();
}
