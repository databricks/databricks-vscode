import { newPatCredentials } from "@databricks/sdk-auth/credentials";
import { ScimClient } from "@databricks/sdk-scim/v1";
import { EventEmitter } from "node:events";
import type { ClientRequest } from "node:http";
import https from "node:https";
import { describe, expect, it, vi } from "vitest";
import { fetchFailed, FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import { stubDatabricksApi } from "../../test-support/fakeDatabricksApi";
import { fakeLog } from "../../test-support/fakes";
import { ApiClients, calls, isRetryableError, sdkLogger } from "./ApiClients";

function clients(http: FakeHttpClient, workspaceId?: string) {
    return new ApiClients({
        host: "https://a.cloud.databricks.com",
        workspaceId,
        credentials: newPatCredentials("dapi-1"),
        httpClient: http,
    });
}

const fast = { backoff: { initial: 1, maximum: 1 } };

describe("ApiClients", () => {
    it("calls SCIM me with the connection's host, credentials and workspace", async () => {
        const http = new FakeHttpClient().on("GET", SCIM_ME, {
            body: { userName: "me@example.com" },
        });
        const me = await clients(http, "42").get(ScimClient).me({}, calls.read(fast));
        expect(me.userName).toBe("me@example.com");
        const request = http.to(SCIM_ME)[0]!;
        expect(request.url).toBe("https://a.cloud.databricks.com/api/2.0/preview/scim/v2/Me");
        expect(request.headers.get("Authorization")).toBe("Bearer dapi-1");
        expect(request.headers.get("X-Databricks-Workspace-Id")).toBe("42");
    });

    it("builds one client per class", () => {
        const api = clients(new FakeHttpClient());
        expect(api.get(ScimClient)).toBe(api.get(ScimClient));
    });

    it("ignores ambient DATABRICKS_* variables", async () => {
        process.env.DATABRICKS_TOKEN = "ambient";
        process.env.DATABRICKS_HOST = "https://ambient.cloud.databricks.com";
        try {
            const http = new FakeHttpClient().on("GET", SCIM_ME, { body: { userName: "me" } });
            await clients(http).get(ScimClient).me({}, calls.read(fast));
            expect(http.requests[0]!.url).toContain("https://a.cloud.databricks.com");
            expect(http.requests[0]!.headers.get("Authorization")).toBe("Bearer dapi-1");
        } finally {
            delete process.env.DATABRICKS_TOKEN;
            delete process.env.DATABRICKS_HOST;
        }
    });

    it("retries reads on 429 and 503", async () => {
        const http = new FakeHttpClient().on(
            "GET",
            SCIM_ME,
            { status: 429, body: { error_code: "TOO_MANY_REQUESTS", message: "slow down" } },
            { status: 503, body: { error_code: "TEMPORARILY_UNAVAILABLE", message: "later" } },
            { body: { userName: "me" } },
        );
        const me = await clients(http).get(ScimClient).me({}, calls.read(fast));
        expect(me.userName).toBe("me");
        expect(http.to(SCIM_ME)).toHaveLength(3);
    });

    it("doesn't retry other errors, and gives up after maxRetries", async () => {
        const forbidden = new FakeHttpClient().on("GET", SCIM_ME, {
            status: 403,
            body: { error_code: "PERMISSION_DENIED", message: "no" },
        });
        await expect(clients(forbidden).get(ScimClient).me({}, calls.read(fast))).rejects.toThrow(
            "no",
        );
        expect(forbidden.requests).toHaveLength(1);

        const busy = new FakeHttpClient().on("GET", SCIM_ME, {
            status: 429,
            body: { message: "slow down" },
        });
        await expect(
            clients(busy)
                .get(ScimClient)
                .me({}, calls.read({ ...fast, maxRetries: 2 })),
        ).rejects.toThrow();
        expect(busy.requests).toHaveLength(3);
    });

    it("never retries writes", async () => {
        const http = new FakeHttpClient().on(
            "GET",
            SCIM_ME,
            { status: 503, body: { message: "later" } },
            { body: { userName: "me" } },
        );
        await expect(clients(http).get(ScimClient).me({}, calls.write())).rejects.toThrow("later");
        expect(http.requests).toHaveLength(1);
    });

    it.each([
        { code: "ENOTFOUND", connecting: true, requests: 1 },
        { code: "EAI_AGAIN", connecting: true, requests: 1 },
        { code: "ECONNREFUSED", connecting: true, requests: 1 },
        { code: "ECONNRESET", connecting: true, requests: 3 },
        { code: "EHOSTUNREACH", connecting: true, requests: 3 },
        { code: "ENETUNREACH", connecting: true, requests: 3 },
        { code: "ENOTFOUND", connecting: false, requests: 3 },
    ])(
        "$code, connecting $connecting: $requests requests",
        async ({ code, connecting, requests }) => {
            const http = new FakeHttpClient().on("GET", SCIM_ME, () => {
                throw fetchFailed(code);
            });
            await expect(
                clients(http)
                    .get(ScimClient)
                    .me({}, calls.read({ ...fast, maxRetries: 2, connecting })),
            ).rejects.toThrow("fetch failed");
            expect(http.requests).toHaveLength(requests);
        },
    );
});

describe("sdkLogger", () => {
    it("logs HTTP response status but drops the body", () => {
        const log = fakeLog();
        const logger = sdkLogger(log.child("test"));
        logger.debug("HTTP response", { statusCode: 200, body: "sensitive data" });
        expect(log.entries).toHaveLength(1);
        const entry = log.entries[0]!;
        expect(entry.message).toBe("HTTP response");
        expect(entry.data).toEqual([{ statusCode: 200 }]);
    });

    it("other debug messages with body are untouched", () => {
        const log = fakeLog();
        const logger = sdkLogger(log.child("test"));
        logger.debug("HTTP request", { body: "request body", method: "GET" });
        expect(log.entries).toHaveLength(1);
        expect(log.entries[0]!.data).toEqual([{ body: "request body", method: "GET" }]);
    });

    it("HTTP response with non-object arguments passes through", () => {
        const log = fakeLog();
        const logger = sdkLogger(log.child("test"));
        logger.debug("HTTP response", "string arg", 123, null);
        expect(log.entries).toHaveLength(1);
        expect(log.entries[0]!.data).toEqual(["string arg", 123, null]);
    });

    it("SDK client built with sdkLogger never logs response bodies", async () => {
        const log = fakeLog();
        const http = new FakeHttpClient().on("GET", SCIM_ME, {
            body: { userName: "test@example.com", emails: [{ value: "test@example.com" }] },
        });
        const api = new ApiClients({
            host: "https://a.cloud.databricks.com",
            credentials: newPatCredentials("dapi-1"),
            logger: sdkLogger(log.child("sdk")),
            httpClient: http,
        });
        const me = await api.get(ScimClient).me({}, calls.read(fast));
        expect(me.userName).toBe("test@example.com");

        const logText = JSON.stringify(log.entries);
        expect(logText).not.toContain("test@example.com");
        expect(logText).not.toContain("emails");

        const httpResponseEntry = log.entries.find((e) => e.message === "HTTP response");
        expect(httpResponseEntry).toBeDefined();
        expect(httpResponseEntry?.data?.[0]).toEqual({ statusCode: 200 });
    });

    it("other SDK log messages pass through unchanged", () => {
        const log = fakeLog();
        const logger = sdkLogger(log.child("test"));
        logger.debug("HTTP request", { method: "GET", url: "https://example.com/api" });
        logger.info("Some info", { key: "value" });
        logger.warn("Some warning");
        logger.error("Some error", new Error("test"));

        expect(log.entries).toHaveLength(4);
        expect(log.entries[0]!.message).toBe("HTTP request");
        expect(log.entries[0]!.data).toEqual([{ method: "GET", url: "https://example.com/api" }]);
        expect(log.entries[1]!.message).toBe("Some info");
        expect(log.entries[1]!.data).toEqual([{ key: "value" }]);
        expect(log.entries[2]!.message).toBe("Some warning");
        expect(log.entries[3]!.message).toBe("Some error");
    });
});

/** An error as Node reports it: a message and a code. */
const coded = (code: string, message = code) => Object.assign(new Error(message), { code });

describe("ApiClients without a transport", () => {
    it("sends through the node transport, not the SDK's fetch", async () => {
        const request = vi.spyOn(https, "request").mockImplementation(() => {
            throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
        });
        try {
            const api = new ApiClients({
                host: "https://a.cloud.databricks.com",
                credentials: newPatCredentials("dapi-1"),
            });
            await expect(api.get(ScimClient).me({}, calls.write())).rejects.toMatchObject({
                code: "ECONNREFUSED",
            });
            expect(request).toHaveBeenCalledTimes(1);
        } finally {
            vi.restoreAllMocks();
        }
    });
});

describe("a network that drops out, through the transport", () => {
    it("retries a read that found no route to the host, and gets the next answer", async () => {
        const api = await stubDatabricksApi(() => Response.json({ userName: "me" }));
        // The first request fails as Node does when Wi-Fi or a VPN is reconnecting.
        vi.mocked(https.request).mockImplementationOnce(() => {
            const request = Object.assign(new EventEmitter(), {
                end: () =>
                    setImmediate(() =>
                        request.emit(
                            "error",
                            Object.assign(new Error("connect EHOSTUNREACH"), {
                                code: "EHOSTUNREACH",
                            }),
                        ),
                    ),
                destroy: () => request,
            });
            return request as unknown as ClientRequest;
        });
        const clients = new ApiClients({
            host: "https://a.cloud.databricks.com",
            credentials: newPatCredentials("dapi-1"),
        });
        const me = await clients.get(ScimClient).me({}, calls.read(fast));
        expect(me.userName).toBe("me");
        expect(https.request).toHaveBeenCalledTimes(2);
        expect(api.requests).toHaveLength(1);
    });
});

describe("a certificate error on a later read", () => {
    it.each(["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "CERT_HAS_EXPIRED"])(
        "%s is not retried, though the read retries a dropped connection",
        async (code) => {
            const http = new FakeHttpClient().on("GET", SCIM_ME, () => {
                throw coded(code);
            });
            await expect(
                clients(http)
                    .get(ScimClient)
                    .me({}, calls.read({ ...fast, maxRetries: 2 })),
            ).rejects.toMatchObject({ code });
            expect(http.requests).toHaveLength(1);
        },
    );
});

describe("isRetryableError", () => {
    it.each<[string, Error, boolean]>([
        ["a connection reset", coded("ECONNRESET", "read ECONNRESET"), true],
        ["a timeout", coded("ETIMEDOUT"), true],
        ["a socket hang up", coded("ECONNRESET", "socket hang up"), true],
        [
            "a reset in the cause",
            new TypeError("fetch failed", { cause: coded("ECONNRESET") }),
            true,
        ],
        ["an undici timeout", coded("UND_ERR_CONNECT_TIMEOUT"), true],
        ["a name lookup", coded("ENOTFOUND", "getaddrinfo ENOTFOUND host"), true],
        ["a refused connection", coded("ECONNREFUSED", "connect ECONNREFUSED"), true],
        ["no route to the host", coded("EHOSTUNREACH", "connect EHOSTUNREACH"), true],
        ["an unreachable network", coded("ENETUNREACH", "connect ENETUNREACH"), true],
        ["a broken pipe", coded("EPIPE", "write EPIPE"), true],
        ["an aborted connection", coded("ECONNABORTED"), true],
        ["an untrusted certificate", coded("UNABLE_TO_VERIFY_LEAF_SIGNATURE"), false],
        ["a self-signed certificate", coded("SELF_SIGNED_CERT_IN_CHAIN"), false],
        ["an expired certificate", coded("CERT_HAS_EXPIRED"), false],
        ["a depth-zero certificate", coded("DEPTH_ZERO_SELF_SIGNED_CERT"), false],
        ["a TLS error", coded("ERR_TLS_CERT_ALTNAME_INVALID"), false],
        [
            "a certificate in the cause",
            new TypeError("fetch failed", { cause: coded("CERT_HAS_EXPIRED") }),
            false,
        ],
        [
            "VS Code's proxy refusal, which has no code",
            new Error("Failed to establish a socket connection to proxies"),
            false,
        ],
        ["an abort", Object.assign(coded("ECONNRESET"), { name: "AbortError" }), false],
        ["a timeout error", Object.assign(new Error("timed out"), { name: "TimeoutError" }), false],
        ["a bare TypeError", new TypeError("fetch failed"), false],
        ["an error with no code", new Error("bad"), false],
    ])("%s", (_name, error, retryable) => {
        expect(isRetryableError(error)).toBe(retryable);
    });
});
