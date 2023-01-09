/* eslint-disable @typescript-eslint/naming-convention */
import * as https from "node:https";
import {TextDecoder} from "node:util";
import {fetch} from "./fetch";
import {ExposedLoggers, Utils, withLogContext} from "./logging";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {context} from "./context";
import {Context} from "./context";
import {Headers, Config} from "./config/Config";
import retry, {RetriableError} from "./retries/retries";
import Time, {TimeUnits} from "./retries/Time";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sdkVersion = require("../package.json").version;

type HttpMethod = "POST" | "GET" | "DELETE" | "PATCH" | "PUT";

export class HttpError extends Error {
    constructor(readonly message: string, readonly code: number) {
        super(message);
    }
}

export class ApiClientResponseError extends Error {
    constructor(readonly message: string, readonly response: any) {
        super(message);
    }
}

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
    readonly accountId = "";

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

        const response = await retry<
            Awaited<Awaited<ReturnType<typeof fetch>>["response"]>
        >({
            timeout: new Time(
                this.config.retryTimeoutSeconds || 300,
                TimeUnits.seconds
            ),
            fn: async () => {
                let response;
                try {
                    const {abort, response: responsePromise} = await fetch(
                        url.toString(),
                        options
                    );
                    if (context?.cancellationToken?.onCancellationRequested) {
                        context?.cancellationToken?.onCancellationRequested(
                            abort
                        );
                    }
                    response = await responsePromise;
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

                switch (response.status) {
                    case 500:
                    case 429:
                        throw new RetriableError();

                    default:
                        break;
                }
                return response;
            },
        });

        let responseText!: string;
        try {
            const responseBody = await response.arrayBuffer();
            responseText = new TextDecoder().decode(responseBody);
        } catch (e: any) {
            logAndReturnError(url, options, "", e, context);
            throw new ApiClientResponseError(
                `Can't parse response from ${url.toString()}`,
                ""
            );
        }

        // throw error if the URL is incorrect and we get back an HTML page
        if (response.headers.get("content-type")?.match("text/html")) {
            // When the AAD tenant is not configured correctly, the response is a HTML page with a title like this:
            // "Error 400 io.jsonwebtoken.IncorrectClaimException: Expected iss claim to be: https://sts.windows.net/aaaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa/, but was: https://sts.windows.net/bbbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb/."
            const m = responseText.match(/<title>(Error \d+.*?)<\/title>/);
            let error: HttpError;
            if (m) {
                error = new HttpError(m[1], response.status);
            } else {
                error = new HttpError(
                    `Can't connect to ${url.toString()}`,
                    response.status
                );
            }

            throw logAndReturnError(url, options, response, error, context);
        }

        // TODO proper error handling
        if (!response.ok) {
            const err = responseText.match(/invalid access token/i)
                ? new HttpError("Invalid access token", response.status)
                : new HttpError(responseText, response.status);
            throw logAndReturnError(url, options, responseText, err, context);
        }

        let responseJson: any;
        try {
            responseJson = JSON.parse(responseText);
        } catch (e) {
            logAndReturnError(url, options, responseText, e, context);
            throw new ApiClientResponseError(responseText, responseJson);
        }

        if ("error" in responseJson) {
            logAndReturnError(
                url,
                options,
                responseJson,
                responseJson.error,
                context
            );
            throw new ApiClientResponseError(responseJson.error, responseJson);
        }

        if ("error_code" in responseJson) {
            const message =
                responseJson.message || `HTTP error ${responseJson.error_code}`;
            throw logAndReturnError(
                url,
                options,
                responseJson,
                new HttpError(message, responseJson.error_code),
                context
            );
        }
        context?.logger?.debug(url.toString(), {
            request: options,
            response: responseJson,
        });
        return responseJson;
    }
}
