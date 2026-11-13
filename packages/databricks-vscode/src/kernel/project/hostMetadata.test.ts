import { describe, expect, it } from "vitest";
import { fakeLog } from "../../test-support/fakes";
import { FakeHttpClient } from "../../test-support/fakeHttp";
import { hostMetadataReader } from "./hostMetadata";

const CONFIG = "/.well-known/databricks-config";

describe("hostMetadataReader", () => {
    it("reads a workspace host's ID and a unified host's type, without any credential", async () => {
        const http = new FakeHttpClient().on("GET", CONFIG, (request) =>
            new URL(request.url).hostname.startsWith("ws")
                ? { body: { host_type: "workspace", workspace_id: 1234123412341234 } }
                : { body: { host_type: "unified", account_id: "acc" } },
        );
        const read = hostMetadataReader(http, fakeLog());
        expect(await read("ws.cloud.databricks.com/")).toEqual({
            hostType: "workspace",
            workspaceId: "1234123412341234",
        });
        expect(await read("https://unified-alias.databricks.com")).toEqual({ hostType: "unified" });
        expect(http.requests.map((r) => r.url)).toEqual([
            `https://ws.cloud.databricks.com${CONFIG}`,
            `https://unified-alias.databricks.com${CONFIG}`,
        ]);
        expect(http.requests.every((r) => !r.headers.has("Authorization"))).toBe(true);
    });

    it("asks each host once per window", async () => {
        const http = new FakeHttpClient().on("GET", CONFIG, { body: { host_type: "unified" } });
        const read = hostMetadataReader(http, fakeLog());
        await read("https://a.cloud.databricks.com");
        await read("https://A.cloud.databricks.com/");
        expect(http.requests).toHaveLength(1);
    });

    it("asks no host outside Databricks' domains", async () => {
        const http = new FakeHttpClient().on("GET", CONFIG, {
            body: { host_type: "workspace", workspace_id: "1234123412341234" },
        });
        expect(
            await hostMetadataReader(http, fakeLog())("https://evil.example.com"),
        ).toBeUndefined();
        expect(http.requests).toEqual([]);
    });

    it("asks a host that doesn't answer in time once per window, so commands don't wait again", async () => {
        const http = new FakeHttpClient().on("GET", CONFIG, () => {
            throw new DOMException("The operation timed out.", "TimeoutError");
        });
        const read = hostMetadataReader(http, fakeLog());
        expect(await read("https://slow.cloud.databricks.com")).toBeUndefined();
        expect(await read("https://slow.cloud.databricks.com")).toBeUndefined();
        expect(http.requests).toHaveLength(1);
    });

    it("knows nothing from an error or a type it doesn't know, and asks again only after a failed read", async () => {
        const answers = new Map<string, { status?: number; text?: string; body?: unknown }[]>([
            ["missing.cloud.databricks.com", [{ status: 404, body: {} }]],
            ["account.cloud.databricks.com", [{ body: { host_type: "account" } }]],
            [
                "proxied.cloud.databricks.com",
                [{ text: "<html>proxy</html>" }, { body: { host_type: "unified" } }],
            ],
        ]);
        const http = new FakeHttpClient().on("GET", CONFIG, (request) => {
            const queue = answers.get(new URL(request.url).hostname)!;
            return queue.length > 1 ? queue.shift()! : queue[0]!;
        });
        const read = hostMetadataReader(http, fakeLog());
        for (const host of ["missing", "account", "missing", "account"]) {
            expect(await read(`https://${host}.cloud.databricks.com`)).toBeUndefined();
        }
        const proxied = "https://proxied.cloud.databricks.com";
        expect(await read(proxied)).toBeUndefined();
        expect(await read(proxied)).toEqual({ hostType: "unified" });
        expect(http.requests).toHaveLength(4);
    });
});
