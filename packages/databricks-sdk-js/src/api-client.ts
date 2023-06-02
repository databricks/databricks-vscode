/* eslint-disable @typescript-eslint/naming-convention */
import * as https from "node:https";
import {TextDecoder} from "node:util";
import fetch from "node-fetch-commonjs";
import {ExposedLoggers, Utils, withLogContext} from "./logging";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {context} from "./context";
import {Context} from "./context";
import {Headers, Config} from "./config/Config";
import retry, {RetriableError} from "./retries/retries";
import Time, {TimeUnits} from "./retries/Time";
import {HttpError, parseErrorFromResponse} from "./apierr";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sdkVersion = require("../package.json").version;

type HttpMethod = "POST" | "GET" | "DELETE" | "PATCH" | "PUT";

function logAndReturnError(
    url: URL,
    request: any,
    response: any,
    error: unknown,
    context?: Context
) {
    context?.logger?.error(url.toString(), {
        request,
        response,
        error: Utils.liftAllErrorProps(error),
    });
    return error;
}

export type ProductVersion = `${number}.${number}.${number}`;

export interface ClientOptions {
    agent?: https.Agent;
    product?: string;
    productVersion?: ProductVersion;
    userAgentExtra?: Record<string, string>;
}

export class ApiClient {
    private agent: https.Agent;
    readonly product: string;
    readonly productVersion: ProductVersion;
    readonly userAgentExtra: Record<string, string>;

    constructor(readonly config: Config, options: ClientOptions = {}) {
        this.agent =
            options.agent ||
            new https.Agent({
                keepAlive: true,
                keepAliveMsecs: 15_000,
                rejectUnauthorized: config.insecureSkipVerify === false,
                timeout: (config.httpTimeoutSeconds || 5) * 1000,
            });

        this.product = options.product || "unknown";
        this.productVersion = options.productVersion || "0.0.0";
        this.userAgentExtra = options.userAgentExtra || {};
    }

    get host(): Promise<URL> {
        return this.config.getHost();
    }

    get accountId(): Promise<string | undefined> {
        return this.config.ensureResolved().then(() => {
            return this.config.accountId;
        });
    }

    userAgent(): string {
        const pairs = [
            `${this.product}/${this.productVersion}`,
            `databricks-sdk-js/${sdkVersion}`,
            `nodejs/${process.version.slice(1)}`,
            `os/${process.platform}`,
            `auth/${this.config.authType}`,
        ];

        for (const [key, value] of Object.entries(this.userAgentExtra)) {
            pairs.push(`${key}/${value}`);
        }
        return pairs.join(" ");
    }

    @withLogContext(ExposedLoggers.SDK)
    async request(
        path: string,
        method: HttpMethod,
        payload?: any,
        @context context?: Context
    ): Promise<unknown> {
        const headers: Headers = {
            "User-Agent": this.userAgent(),
            "Content-Type": "text/json",
        };

        await this.config.authenticate(headers);

        // create a copy of the URL, so that we can modify it
        const url = new URL(this.config.host!);
        url.pathname = path;

        const options: any = {
            method,
            headers,
            agent: this.agent,
        };

        if (payload) {
            if (method === "POST") {
                options.body = JSON.stringify(payload);
            } else {
                url.search = new URLSearchParams(payload).toString();
            }
        }

        const responseText = await retry<string>({
            timeout: new Time(
                this.config.retryTimeoutSeconds || 300,
                TimeUnits.seconds
            ),
            fn: async () => {
                let response;
                let body;
                try {
                    const controller = new AbortController();
                    const signal = controller.signal;
                    const abort = controller.abort;
                    const responsePromise = await fetch(url.toString(), {
                        signal,
                        ...options,
                    });
                    if (context?.cancellationToken?.onCancellationRequested) {
                        context?.cancellationToken?.onCancellationRequested(
                            abort
                        );
                    }
                    response = await responsePromise;
                    body = new TextDecoder().decode(
                        await response.arrayBuffer()
                    );
                } catch (e: any) {
                    const err =
                        e.code && e.code === "ENOTFOUND"
                            ? new HttpError(
                                  `Can't connect to ${url.toString()}`,
                                  500
                              )
                            : e;
                    throw logAndReturnError(url, options, "", err, context);
                }

                if (!response.ok) {
                    const err = parseErrorFromResponse(
                        response.status,
                        response.statusText,
                        body
                    );
                    if (err.isRetryable()) {
                        throw new RetriableError();
                    } else {
                        throw logAndReturnError(
                            url,
                            options,
                            response,
                            err,
                            context
                        );
                    }
                }

                return body;
            },
        });

        let responseJson: any;
        try {
            responseJson =
                responseText.length === 0 ? {} : JSON.parse(responseText);
        } catch (e) {
            logAndReturnError(url, options, responseText, e, context);
            throw new Error(`Can't parse reponse as JSON: ${responseText}`);
        }

        context?.logger?.debug(url.toString(), {
            request: options,
            response: responseJson,
        });
        return responseJson;
    }
}
