/**
 * This file contains a subset of the `fetch` API that is compatible with
 * Node.js. It is not a complete implementation of the `fetch` API.
 *
 * We just implement enough to make the SDK work.
 */
import https from "node:https";
import http from "node:http";
import assert from "node:assert";

export type BodyInit = string;
export type Headers = Record<string, string>;

type AbortListener = (this: AbortSignal) => void;

export class AbortError extends Error {
    type: string;
    name = "AbortError";
    [Symbol.toStringTag] = "AbortError";

    constructor(message: string, type = "aborted") {
        super(message);
        this.type = type;
    }
}

export class AbortController {
    readonly signal: AbortSignal;
    private aborted = false;
    private listeners: AbortListener[] = [];

    constructor() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        this.signal = {
            get aborted() {
                return self.aborted;
            },
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            addEventListener: (type = "abort", listener) => {
                self.listeners.push(listener);
            },
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            removeEventListener: (type = "abort", listener) => {
                self.listeners = self.listeners.filter((l) => l !== listener);
            },
        };

        this.abort = this.abort.bind(this);
    }

    abort() {
        this.aborted = true;
        this.listeners.forEach((listener) => listener.call(this.signal));
    }
}

export interface AbortSignal {
    get aborted(): boolean;

    addEventListener: (type: "abort", listener: AbortListener) => void;
    removeEventListener: (type: "abort", listener: AbortListener) => void;
}

export interface RequestInit {
    body?: BodyInit;
    headers?: Headers;
    method?: string;
    signal?: AbortSignal;

    // extensions to the whatwg/fetch spec
    agent?: https.Agent;
}

export interface ResponseInit {
    headers?: Headers;
    status?: number;
    statusText?: string;
}

export class Response {
    readonly headers: Headers;
    readonly ok: boolean;
    readonly status: number;
    readonly statusText: string;
    readonly url: string;

    constructor(nodeResponse: http.IncomingMessage, private body: string) {
        this.headers = nodeResponse.headers as Headers;
        this.ok =
            nodeResponse.statusCode === undefined
                ? true
                : nodeResponse.statusCode < 400;

        this.status = nodeResponse.statusCode ?? 200;
        this.statusText = nodeResponse.statusMessage ?? "";
        this.url = nodeResponse.url ?? "";
    }

    async text(): Promise<string> {
        return this.body;
    }

    async json(): Promise<unknown> {
        const text = await this.text();
        return JSON.parse(text);
    }
}

export function fetch(uri: string, init?: RequestInit): Promise<Response> {
    const signal = init?.signal;
    const method = init?.method ?? "GET";
    const headers = init?.headers ?? {};

    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            return reject(new AbortError("The operation was aborted."));
        }

        const url = new URL(uri);

        if (init?.body) {
            assert(method === "POST" || method === "PUT");
            headers["Content-Length"] = Buffer.byteLength(init.body).toString();
        }

        const protocol = url.protocol === "https:" ? https : http;
        const req = protocol
            .request(
                {
                    method,
                    headers: init?.headers ?? {},
                    agent: init?.agent,
                    hostname: url.hostname,
                    port: url.port,
                    path: url.pathname + url.search,
                },
                (res) => {
                    res.setEncoding("utf8");
                    // redirect
                    if (
                        (res.statusCode === 301 || res.statusCode === 302) &&
                        res.headers.location
                    ) {
                        return fetch(res.headers.location, init);
                    }

                    let body = "";

                    res.on("data", (chunk) => {
                        body += chunk;
                    });

                    res.on("end", () => {
                        if (signal) {
                            signal.removeEventListener("abort", abort);
                        }
                        if (signal?.aborted) {
                            return;
                        }
                        resolve(new Response(res, body));
                    });

                    res.on("error", (err) => {
                        if (signal) {
                            signal.removeEventListener("abort", abort);
                        }
                        reject(err);
                    });
                }
            )
            .on("error", (err) => {
                reject(err);
            });

        if (signal) {
            signal.addEventListener("abort", abort);
        }

        function abort() {
            const err = new AbortError("The operation was aborted.");
            try {
                req.destroy();
            } catch (e) {
                // pass
            }
            reject(err);
        }

        new Promise<void>((resolve, reject) => {
            if (init?.body) {
                req.write(init.body, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        })
            .then(() => {
                req.end();
            })
            .catch((err) => {
                reject(err);
            });
    });
}
