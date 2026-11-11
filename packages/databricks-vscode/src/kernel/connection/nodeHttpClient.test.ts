import type { IncomingMessage, ServerResponse } from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startLocalHttps, trustLocalCa, type LocalHttps } from "../../test-support/localHttps";
import { nodeHttpClient } from "./nodeHttpClient";

/** Text that doesn't compress to nothing, so half of its compressed form holds some of it. */
const CUT_TEXT = Array.from({ length: 2000 }, (_, i) => `line ${i * 7919}`).join("\n");

interface Seen {
    readonly method: string;
    readonly url: string;
    readonly headers: IncomingMessage["headers"];
    readonly body: string;
}

/**
 * A local HTTPS server with a self-signed certificate that nothing trusts.
 * It records every request, and routes what the transport's features need:
 * an echo, redirects, compressed and multi-value responses, and a response
 * that never ends.
 */
describe("nodeHttpClient", () => {
    let local: LocalHttps;
    let restoreCa: () => void;
    let seen: Seen[] = [];

    beforeAll(async () => {
        local = await startLocalHttps((req, res) => void route(req, res));
        restoreCa = trustLocalCa(local.ca);
    });

    afterAll(async () => {
        restoreCa();
        await local.close();
    });

    afterEach(() => {
        seen.length = 0;
        vi.restoreAllMocks();
    });

    const base = () => local.url;

    async function route(req: IncomingMessage, res: ServerResponse) {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
            chunks.push(chunk as Buffer);
        }
        const url = new URL(req.url ?? "/", local.url);
        seen.push({
            method: req.method ?? "",
            url: req.url ?? "",
            headers: req.headers,
            body: Buffer.concat(chunks).toString(),
        });
        const json = (status: number, body: unknown) => {
            res.writeHead(status, { "content-type": "application/json" });
            res.end(JSON.stringify(body));
        };
        if (url.pathname === "/hop") {
            res.writeHead(Number(url.searchParams.get("status")), {
                location: url.searchParams.get("to") ?? "/echo",
            });
            return res.end();
        }
        if (url.pathname === "/loop") {
            res.writeHead(302, { location: "/loop" });
            return res.end();
        }
        if (url.pathname === "/encoded") {
            const encoding = url.searchParams.get("enc") ?? "gzip";
            const compress =
                encoding === "br"
                    ? zlib.brotliCompressSync
                    : encoding === "deflate"
                      ? zlib.deflateSync
                      : zlib.gzipSync;
            res.writeHead(200, {
                "content-type": "application/json",
                "content-encoding": encoding,
            });
            return res.end(compress(JSON.stringify({ ok: true })));
        }
        if (url.pathname === "/multi") {
            res.writeHead(200, { "content-type": "application/json", "x-multi": ["a", "b"] });
            return res.end("{}");
        }
        if (url.pathname === "/hold") {
            // Still open after the first part, so an abort has a body to error. Ends on its own.
            res.writeHead(200, { "content-type": "text/plain" });
            res.write("part");
            setTimeout(() => res.end(), 500);
            return;
        }
        if (url.pathname === "/reset-gzip") {
            // A valid gzip start, then the connection drops before the body ends.
            const gz = zlib.gzipSync("x".repeat(100_000));
            res.writeHead(200, { "content-encoding": "gzip" });
            res.write(gz.subarray(0, 200));
            setTimeout(() => res.socket?.destroy(), 20);
            return;
        }
        if (url.pathname === "/cut-encoded") {
            // A compressed body that ends early but cleanly, or is empty: fetch returns what it holds.
            const encoding = url.searchParams.get("enc") ?? "gzip";
            const compress =
                encoding === "br"
                    ? zlib.brotliCompressSync
                    : encoding === "deflate"
                      ? zlib.deflateSync
                      : zlib.gzipSync;
            const full = compress(CUT_TEXT);
            res.writeHead(200, { "content-type": "text/plain", "content-encoding": encoding });
            return res.end(url.searchParams.has("empty") ? "" : full.subarray(0, full.length / 2));
        }
        if (url.pathname === "/no-content") {
            res.writeHead(204, { "content-encoding": "gzip" });
            return res.end();
        }
        if (url.pathname === "/never") {
            return;
        }
        json(200, { method: req.method, body: Buffer.concat(chunks).toString() });
    }

    const send = (init: Partial<Parameters<ReturnType<typeof nodeHttpClient>["send"]>[0]>) =>
        nodeHttpClient().send({
            url: `${base()}/echo`,
            method: "GET",
            headers: new Headers(),
            ...init,
        });

    it("sends string, buffer, typed-array and stream bodies, with any method", async () => {
        const text = await send({ method: "POST", body: "hello" });
        expect(await new Response(text.body).json()).toEqual({ method: "POST", body: "hello" });
        expect(seen.at(-1)?.headers["content-type"]).toBe("text/plain;charset=UTF-8");

        await send({ method: "PUT", body: new TextEncoder().encode("bytes") });
        expect(seen.at(-1)?.body).toBe("bytes");

        await send({ method: "PATCH", body: new TextEncoder().encode("p").buffer });
        expect(seen.at(-1)).toMatchObject({ method: "PATCH", body: "p" });

        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode("strea"));
                controller.enqueue(new TextEncoder().encode("med"));
                controller.close();
            },
        });
        await send({ method: "DELETE", body: stream });
        expect(seen.at(-1)).toMatchObject({ method: "DELETE", body: "streamed" });
    });

    it("keeps the caller's Content-Type over the string default", async () => {
        await send({
            method: "POST",
            headers: new Headers({ "Content-Type": "application/json" }),
            body: "{}",
        });
        expect(seen.at(-1)?.headers["content-type"]).toBe("application/json");
    });

    it("returns the response as a web stream", async () => {
        const response = await send({});
        expect(response.statusCode).toBe(200);
        expect(response.body).toBeInstanceOf(ReadableStream);
        expect(await new Response(response.body).json()).toEqual({ method: "GET", body: "" });
    });

    it("keeps every value of a multi-value header", async () => {
        const response = await send({ url: `${base()}/multi` });
        expect(response.headers.get("x-multi")).toBe("a, b");
    });

    it("rejects at once with AbortError when the signal is already aborted", async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(send({ signal: controller.signal })).rejects.toMatchObject({
            name: "AbortError",
        });
        expect(seen).toHaveLength(0);
    });

    it("rejects with AbortError when aborted before the response", async () => {
        const controller = new AbortController();
        const pending = send({ url: `${base()}/never`, signal: controller.signal });
        setTimeout(() => controller.abort(), 20);
        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    });

    it("errors the body stream with AbortError when aborted mid-body", async () => {
        const controller = new AbortController();
        const response = await send({ url: `${base()}/hold`, signal: controller.signal });
        const reader = response.body!.getReader();
        expect(new TextDecoder().decode((await reader.read()).value)).toBe("part");
        controller.abort();
        await expect(reader.read()).rejects.toMatchObject({ name: "AbortError" });
    });

    it("follows a 301 or 302 POST, and a 303, as a GET without a body", async () => {
        for (const status of [301, 302, 303]) {
            seen.length = 0;
            const response = await send({
                url: `${base()}/hop?status=${status}`,
                method: "POST",
                headers: new Headers({ "Content-Type": "application/json" }),
                body: "{}",
            });
            expect(await new Response(response.body).json()).toEqual({
                method: "GET",
                body: "",
            });
            expect(seen.map((r) => r.method)).toEqual(["POST", "GET"]);
            expect(seen[1]?.headers["content-type"]).toBeUndefined();
        }
    });

    it("follows a 303 after any method but HEAD as a GET, and keeps PUT on a 301 or 302", async () => {
        for (const [status, method, after] of [
            [303, "PUT", "GET"],
            [303, "DELETE", "GET"],
            [303, "HEAD", "HEAD"],
            [301, "PUT", "PUT"],
            [302, "PATCH", "PATCH"],
        ] as const) {
            seen.length = 0;
            await send({
                url: `${base()}/hop?status=${status}`,
                method,
                ...(method === "HEAD" ? {} : { body: "kept" }),
            });
            expect(seen.map((r) => r.method)).toEqual([method, after]);
            expect(seen[1]?.body).toBe(after === "GET" || after === "HEAD" ? "" : "kept");
        }
    });

    it("keeps the method and body on a 307 or 308", async () => {
        for (const status of [307, 308]) {
            seen.length = 0;
            const response = await send({
                url: `${base()}/hop?status=${status}`,
                method: "POST",
                body: "kept",
            });
            expect(await new Response(response.body).json()).toEqual({
                method: "POST",
                body: "kept",
            });
        }
    });

    it("refuses to follow a 307 with a streamed body, as fetch does", async () => {
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode("x"));
                controller.close();
            },
        });
        await expect(
            send({ url: `${base()}/hop?status=307`, method: "POST", body: stream }),
        ).rejects.toThrow(TypeError);
    });

    it("drops Authorization and Cookie on a cross-origin hop only", async () => {
        const headers = new Headers({ Authorization: "Bearer t", Cookie: "c=1" });
        // localhost to 127.0.0.1 is another origin.
        await send({
            url: `${base()}/hop?status=302&to=${local.url.replace("localhost", "127.0.0.1")}/echo`,
            headers,
        });
        expect(seen[1]?.headers.authorization).toBeUndefined();
        expect(seen[1]?.headers.cookie).toBeUndefined();

        seen.length = 0;
        await send({ url: `${base()}/hop?status=302&to=/echo`, headers });
        expect(seen[1]?.headers.authorization).toBe("Bearer t");
        expect(seen[1]?.headers.cookie).toBe("c=1");
    });

    it("gives up after 20 redirects", async () => {
        await expect(send({ url: `${base()}/loop` })).rejects.toThrow("redirect count exceeded");
        // The first request and 20 redirects.
        expect(seen).toHaveLength(21);
    });

    it("decodes a compressed response the server sent without being asked", async () => {
        for (const encoding of ["gzip", "deflate", "br"]) {
            const response = await send({ url: `${base()}/encoded?enc=${encoding}` });
            expect(await new Response(response.body).json()).toEqual({ ok: true });
        }
    });

    it("returns what an empty or cut-off compressed body holds, as fetch does", async () => {
        for (const encoding of ["gzip", "deflate", "br"]) {
            const empty = await send({ url: `${base()}/cut-encoded?enc=${encoding}&empty` });
            expect(await new Response(empty.body).text()).toBe("");
            const cut = await send({ url: `${base()}/cut-encoded?enc=${encoding}` });
            const text = await new Response(cut.body).text();
            expect(text.length).toBeGreaterThan(0);
            expect(CUT_TEXT.startsWith(text)).toBe(true);
        }
    });

    it("sends no Accept-Encoding unless the caller set one", async () => {
        await send({});
        expect(seen.at(-1)?.headers["accept-encoding"]).toBeUndefined();

        await send({ headers: new Headers({ "Accept-Encoding": "identity" }) });
        expect(seen.at(-1)?.headers["accept-encoding"]).toBe("identity");
    });

    it("passes rejectUnauthorized as the getter says for each request, so a change applies at once", async () => {
        // The one test that turns verification off, for the request whose setting is off: it checks the option
        // the setting sets. Every other request pins the local CA and verifies.
        let strict = true;
        const client = nodeHttpClient({ rejectUnauthorized: () => strict });
        const passed: unknown[] = [];
        const real = https.request;
        vi.spyOn(https, "request").mockImplementation((url, options, callback) => {
            passed.push((options as https.RequestOptions).rejectUnauthorized);
            return real(url as URL, options as https.RequestOptions, callback as never);
        });
        const get = () =>
            client.send({ url: `${base()}/echo`, method: "GET", headers: new Headers() });

        expect((await get()).statusCode).toBe(200);
        strict = false;
        expect((await get()).statusCode).toBe(200);
        strict = true;
        expect((await get()).statusCode).toBe(200);
        expect(passed).toEqual([true, false, true]);
    });

    it("passes neither an agent nor a CA, so VS Code's patch supplies the proxy and certificates", async () => {
        const request = vi.spyOn(https, "request");
        await send({});
        const options = request.mock.calls[0]?.[1] as Record<string, unknown>;
        expect(options).not.toHaveProperty("agent");
        expect(options).not.toHaveProperty("ca");
        expect(options.rejectUnauthorized).toBe(true);
    });

    it("rejects a timed-out request with its TimeoutError, not an AbortError", async () => {
        // As the SDK times out a call: AbortSignal.timeout, whose reason is a TimeoutError.
        await expect(
            send({ url: `${base()}/never`, signal: AbortSignal.timeout(20) }),
        ).rejects.toMatchObject({ name: "TimeoutError" });
    });

    it("rejects with the signal's reason when it was aborted before the request", async () => {
        await expect(
            send({ signal: AbortSignal.abort(new DOMException("timed out", "TimeoutError")) }),
        ).rejects.toMatchObject({ name: "TimeoutError" });
    });

    it("reads a 204 that says it's gzip without decoding an empty body", async () => {
        const response = await send({ url: `${base()}/no-content` });
        expect(response.statusCode).toBe(204);
        expect(await new Response(response.body).text()).toBe("");
    });

    it("rejects with Node's own error, with its code", async () => {
        await expect(
            nodeHttpClient().send({
                url: "http://127.0.0.1:1/",
                method: "GET",
                headers: new Headers(),
            }),
        ).rejects.toMatchObject({ code: "ECONNREFUSED" });
    });

    it("stops the next redirect hop when the signal aborts between hops", async () => {
        const controller = new AbortController();
        const real = https.request;
        vi.spyOn(https, "request").mockImplementation((url, options, callback) =>
            real(url as URL, options as https.RequestOptions, (res) => {
                (callback as (res: unknown) => void)(res);
                // After the headers arrive, before the next hop is sent.
                controller.abort();
            }),
        );
        await expect(
            send({ url: `${base()}/hop?status=302`, signal: controller.signal }),
        ).rejects.toMatchObject({ name: "AbortError" });
        expect(seen).toHaveLength(1);
    });

    it("sends a GET after a redirect without the chunked framing a streamed body had", async () => {
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode("x"));
                controller.close();
            },
        });
        await send({ url: `${base()}/hop?status=303`, method: "POST", body: stream });
        expect(seen).toHaveLength(2);
        expect(seen[1]?.method).toBe("GET");
        expect(seen[1]?.headers["transfer-encoding"]).toBeUndefined();
    });

    it("errors the body when a compressed response is cut off mid-body", async () => {
        const response = await send({ url: `${base()}/reset-gzip` });
        const reader = response.body!.getReader();
        await expect(
            (async () => {
                for (;;) {
                    if ((await reader.read()).done) {
                        return;
                    }
                }
            })(),
        ).rejects.toThrow();
    });

    it("errors the body when the signal aborts between the headers and the body", async () => {
        const controller = new AbortController();
        const real = https.request;
        vi.spyOn(https, "request").mockImplementation((url, options, callback) =>
            real(url as URL, options as https.RequestOptions, (res) => {
                (callback as (res: unknown) => void)(res);
                controller.abort();
            }),
        );
        const response = await send({ url: `${base()}/hold`, signal: controller.signal });
        // Data already buffered may still come out; the stream must then fail, not end.
        const reader = response.body!.getReader();
        await expect(
            (async () => {
                for (;;) {
                    if ((await reader.read()).done) {
                        return;
                    }
                }
            })(),
        ).rejects.toMatchObject({ name: "AbortError" });
    });
});
