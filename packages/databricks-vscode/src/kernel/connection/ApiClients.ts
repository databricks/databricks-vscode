import type { Credentials } from "@databricks/sdk-auth";
import { ApiError } from "@databricks/sdk-core/apierror";
import type { HttpClient } from "@databricks/sdk-core/http";
import type { Logger as SdkLogger } from "@databricks/sdk-core/logger";
import { BackoffPolicy, type BackoffPolicyOptions, type Retrier } from "@databricks/sdk-core/ops";
import type { CallOptions } from "@databricks/sdk-options/call";
import type { ClientOptions } from "@databricks/sdk-options/client";
import type { Logger } from "../../platform/log";
import { isFinalNetworkFailure, networkFailureCode } from "./unreachable";
import { nodeHttpClient } from "./nodeHttpClient";

export interface ApiClientsOptions {
    readonly host: string;
    readonly workspaceId?: string;
    readonly credentials: Credentials;
    readonly logger?: SdkLogger;
    /** The transport. Defaults to `nodeHttpClient()`, which verifies certificates. */
    readonly httpClient?: HttpClient;
}

/**
 * The one place SDK clients are built. Every client of a connection
 * shares its host, workspace ID, credentials, logger and transport.
 * `profileOptions` turns off the SDK's own profile and environment lookup:
 * ambient `DATABRICKS_*` variables in the extension host must never override
 * the connection's profile.
 */
export class ApiClients {
    private readonly clients = new Map<unknown, unknown>();
    private readonly transport: HttpClient;

    constructor(private readonly options: ApiClientsOptions) {
        this.transport = options.httpClient ?? nodeHttpClient();
    }

    /** The credentials' authorization headers, for callers outside the SDK (the public API). */
    async authHeaders(): Promise<Record<string, string>> {
        const headers = await this.options.credentials.authHeaders();
        return Object.fromEntries(headers.map((h) => [h.key, h.value]));
    }

    /** One cached instance per client class, for example `get(ScimClient)`. */
    get<T>(client: new (options: ClientOptions) => T): T {
        let instance = this.clients.get(client) as T | undefined;
        if (instance === undefined) {
            instance = new client(this.clientOptions(this.transport));
            this.clients.set(client, instance);
        }
        return instance;
    }

    /**
     * A new client whose transport is wrapped, for a call that needs the raw
     * response: only to read fields the SDK drops, until it keeps them.
     */
    fresh<T>(
        client: new (options: ClientOptions) => T,
        wrap: (transport: HttpClient) => HttpClient,
    ): T {
        return new client(this.clientOptions(wrap(this.transport)));
    }

    private clientOptions(httpClient: HttpClient): ClientOptions {
        return {
            host: this.options.host,
            ...(this.options.workspaceId !== undefined
                ? { workspaceId: this.options.workspaceId }
                : {}),
            credentials: this.options.credentials,
            ...(this.options.logger !== undefined ? { logger: this.options.logger } : {}),
            httpClient,
            profileOptions: { noProfile: true, disableEnv: true },
        };
    }
}

const RETRYABLE_STATUS = new Set([429, 503]);
const DEFAULT_READ_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 5;

/**
 * A 429 or 503 response, or a network failure in the table of
 * `unreachable.ts`: a refused connection, a host that doesn't resolve, a
 * timeout or a dropped connection. Which of those fail at once is decided by
 * the call's `connecting` option, not here. A certificate error, and an error
 * with no code such as VS Code's "Failed to establish a socket connection to
 * proxies", never retries: a retry gets the same answer.
 */
export function isRetryableError(error: Error): boolean {
    if (error instanceof ApiError) {
        return RETRYABLE_STATUS.has(error.httpStatusCode);
    }
    if (error.name === "AbortError" || error.name === "TimeoutError") {
        return false;
    }
    return networkFailureCode(error) !== undefined;
}

export interface CallPolicyOptions {
    readonly signal?: AbortSignal;
    readonly timeout?: number;
    readonly maxRetries?: number;
    readonly backoff?: BackoffPolicyOptions;
    /**
     * The call that opens a connection, each time one opens: a host that
     * doesn't resolve or refuses the connection gives up at once, as the old
     * extension did, since a retry most likely gets the same; Retry tries
     * again. Reads on an open connection retry these, to ride out a network
     * that drops for a moment.
     */
    readonly connecting?: boolean;
}

/**
 * Call options. The SDK retries nothing on its own: reads retry
 * 429, 503 and network errors with backoff, within a timeout; writes are
 * never retried, because a retried write may apply twice.
 */
export const calls = {
    read(options: CallPolicyOptions = {}): CallOptions {
        const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
        return {
            ...(options.signal !== undefined ? { signal: options.signal } : {}),
            timeout: options.timeout ?? DEFAULT_READ_TIMEOUT_MS,
            retrier: (): Retrier => {
                const backoff = new BackoffPolicy({
                    initial: 500,
                    maximum: 10_000,
                    ...options.backoff,
                });
                let retries = 0;
                return {
                    isRetriable: (error) => {
                        if (
                            retries >= maxRetries ||
                            !isRetryableError(error) ||
                            (options.connecting === true && isFinalNetworkFailure(error))
                        ) {
                            return undefined;
                        }
                        retries++;
                        return backoff.delay();
                    },
                };
            },
        };
    },

    write(
        options: Omit<CallPolicyOptions, "maxRetries" | "backoff" | "connecting"> = {},
    ): CallOptions {
        return {
            ...(options.signal !== undefined ? { signal: options.signal } : {}),
            ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
        };
    },
};

/** A response body can hold user data, and the JSON log file keeps every level, so the SDK's response lines keep only their status. */
function withoutBody(arg: unknown): unknown {
    if (typeof arg === "object" && arg !== null && "body" in (arg as Record<string, unknown>)) {
        const obj = arg as Record<string, unknown>;
        const filtered = { ...obj };
        delete filtered.body;
        return filtered;
    }
    return arg;
}

/** The SDK's logger interface, over the extension's log. The SDK has no global logger. */
export function sdkLogger(log: Logger): SdkLogger {
    return {
        debug: (message, ...args) =>
            log.debug(message, ...(message === "HTTP response" ? args.map(withoutBody) : args)),
        info: (message, ...args) => log.info(message, ...args),
        warn: (message, ...args) => log.warn(message, ...args),
        error: (message, ...args) => log.error(message, ...args),
    };
}
