import type { IncomingMessage, ServerResponse } from "node:http";
import https from "node:https";
import { onTestFinished, vi } from "vitest";
import { startLocalHttps, trustLocalCa } from "./localHttps";

export interface FakeDatabricksApi {
    /** Every request the handler saw, with the URL the caller asked for. */
    readonly requests: Request[];
    close(): Promise<void>;
}

/**
 * Answers the requests the extension sends to Databricks hosts, as a
 * `vi.stubGlobal("fetch", …)` did before the transport used `node:https`. The
 * spy on `https.request` sends each request to a local HTTPS server, which
 * gives the handler the request as the caller made it, and the handler's
 * response back. The server's self-signed certificate is trusted for the test
 * only, through the global agent. Close it when the test ends.
 */
export async function fakeDatabricksApi(
    handler: (request: Request) => Response | Promise<Response>,
): Promise<FakeDatabricksApi> {
    const requests: Request[] = [];
    const serve = async (req: IncomingMessage, res: ServerResponse) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
            chunks.push(chunk as Buffer);
        }
        const headers = { ...req.headers };
        const forwarded = String(headers["x-fake-host"]);
        delete headers["x-fake-host"];
        delete headers.host;
        const init: RequestInit = { method: req.method, headers: toHeaders(headers) };
        if (chunks.length > 0 && req.method !== "GET" && req.method !== "HEAD") {
            init.body = Buffer.concat(chunks);
        }
        const request = new Request(`https://${forwarded}${req.url}`, init);
        requests.push(request);
        const response = await handler(request);
        response.headers.forEach((value, name) => res.setHeader(name, value));
        res.statusCode = response.status;
        res.end(Buffer.from(await response.arrayBuffer()));
    };
    const local = await startLocalHttps((req, res) => void serve(req, res));
    const restoreCa = trustLocalCa(local.ca);
    const request = https.request;
    const spy = vi
        .spyOn(https, "request")
        .mockImplementation((url: unknown, options: unknown, callback: unknown) => {
            const target = url as URL;
            const opts = (options ?? {}) as https.RequestOptions;
            const headers = {
                ...(opts.headers as Record<string, string>),
                "x-fake-host": target.host,
            };
            return request(
                new URL(`${target.pathname}${target.search}`, local.url),
                { ...opts, headers },
                callback as never,
            );
        });
    return {
        requests,
        close: async () => {
            spy.mockRestore();
            restoreCa();
            await local.close();
        },
    };
}

function toHeaders(values: Record<string, string | string[] | undefined>): Headers {
    const headers = new Headers();
    for (const [name, value] of Object.entries(values)) {
        for (const v of [value ?? []].flat()) {
            headers.append(name, v);
        }
    }
    return headers;
}

/** `fakeDatabricksApi` for a test, closed when the test ends. */
export async function stubDatabricksApi(
    handler: (request: Request) => Response | Promise<Response>,
): Promise<FakeDatabricksApi> {
    const api = await fakeDatabricksApi(handler);
    onTestFinished(() => api.close());
    return api;
}
