import { describe, expect, it } from "vitest";
import { fetchFailed } from "../../test-support/fakeHttp";
import { HostUnreachableError, isFinalNetworkFailure, unreachableError } from "./unreachable";

const HOST = "https://a.cloud.databricks.com";

describe("unreachableError", () => {
    it.each([
        { code: "ENOTFOUND", what: "the host name doesn't resolve", final: true },
        { code: "EAI_AGAIN", what: "the host name lookup failed", final: true },
        { code: "ECONNREFUSED", what: "the connection was refused", final: true },
        { code: "ETIMEDOUT", what: "the connection timed out", final: false },
        { code: "UND_ERR_CONNECT_TIMEOUT", what: "the connection timed out", final: false },
        { code: "ECONNRESET", what: "the connection was dropped", final: false },
        { code: "UND_ERR_SOCKET", what: "the connection was dropped", final: false },
        { code: "EHOSTUNREACH", what: "there's no route to the host", final: false },
        { code: "ENETUNREACH", what: "the network is unreachable", final: false },
        { code: "EPIPE", what: "the connection was dropped", final: false },
        { code: "ECONNABORTED", what: "the connection was dropped", final: false },
    ])("$code: names the host and what failed; final: $final", ({ code, what, final }) => {
        const error = unreachableError(HOST, fetchFailed(code));
        expect(error).toBeInstanceOf(HostUnreachableError);
        expect(error?.message).toBe(
            `Can't reach a.cloud.databricks.com: ${what}. Check the host, or your network.`,
        );
        expect(isFinalNetworkFailure(fetchFailed(code))).toBe(final);
    });

    it("finds the code on the error itself, or deeper under it", () => {
        const refused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:9"), {
            code: "ECONNREFUSED",
        });
        expect(unreachableError(HOST, refused)?.code).toBe("ECONNREFUSED");
        const nested = new TypeError("fetch failed", { cause: new Error("x", { cause: refused }) });
        expect(unreachableError(HOST, nested)?.code).toBe("ECONNREFUSED");
    });

    it("keeps the error it replaces as its cause, and the host with its port", () => {
        const original = fetchFailed("ENOTFOUND");
        const error = unreachableError("https://a.cloud.databricks.com:8443", original);
        expect(error?.cause).toBe(original);
        expect(error?.message).toMatch(/^Can't reach a\.cloud\.databricks\.com:8443: /);
    });

    it("leaves every other error alone", () => {
        for (const error of [
            new TypeError("fetch failed"),
            new Error("Invalid token"),
            Object.assign(new Error("aborted"), { name: "AbortError" }),
            Object.assign(new Error("permission denied"), { code: "EACCES" }),
            Object.assign(new Error("odd"), { code: "constructor" }),
            "not an error",
        ]) {
            expect(unreachableError(HOST, error)).toBeUndefined();
            expect(isFinalNetworkFailure(error)).toBe(false);
        }
    });
});
