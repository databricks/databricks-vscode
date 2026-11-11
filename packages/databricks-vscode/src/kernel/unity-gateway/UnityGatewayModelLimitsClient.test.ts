import { newPatCredentials } from "@databricks/sdk-auth/credentials";
import { describe, expect, it } from "vitest";
import { FakeHttpClient } from "../../test-support/fakeHttp";
import { ApiClients, calls } from "../connection/ApiClients";
import { UnityGatewayModelLimitsClient } from "./UnityGatewayModelLimitsClient";

const MODELS = "/ai-gateway/anthropic/v1/models";

function client(http: FakeHttpClient) {
    return new ApiClients({
        host: "https://a.cloud.databricks.com",
        workspaceId: "123",
        credentials: newPatCredentials("dapi-1"),
        httpClient: http,
    }).get(UnityGatewayModelLimitsClient);
}

describe("UnityGatewayModelLimitsClient", () => {
    it("keeps the limits the gateway reports, by model service, and leaves out the rest", async () => {
        const http = new FakeHttpClient().on("GET", MODELS, {
            body: {
                data: [
                    {
                        id: "system.ai.claude-sonnet-4-6",
                        max_input_tokens: 1_000_000,
                        max_tokens: 128_000,
                    },
                    {
                        id: "anthropic-aigw-0a1b2c3d-system.ai.model-a",
                        max_input_tokens: 922_000,
                        max_tokens: 128_000,
                    },
                    {
                        id: "anthropic-aigw-0A1B2C3E-system.ai.model-b",
                        max_input_tokens: 922_000,
                        max_tokens: 128_000,
                    },
                    // What the gateway reports for a model whose limits it doesn't know.
                    {
                        id: "anthropic-aigw-0f1e2d3c-system.ai.model-c",
                        max_input_tokens: 0,
                        max_tokens: 0,
                    },
                    { id: "system.ai.no-limits" },
                    { id: "system.ai.no-output", max_input_tokens: 200_000 },
                    { id: "system.ai.zero-output", max_input_tokens: 200_000, max_tokens: 0 },
                    // No room for a prompt.
                    { id: "system.ai.full", max_input_tokens: 32_000, max_tokens: 32_000 },
                    { id: "system.ai.negative", max_input_tokens: 200_000, max_tokens: -1 },
                    { id: "system.ai.fraction", max_input_tokens: 200_000.5, max_tokens: 32_000 },
                    { id: "system.ai.text", max_input_tokens: "200000", max_tokens: 32_000 },
                    { max_input_tokens: 200_000, max_tokens: 32_000 },
                    "system.ai.not-an-object",
                ],
            },
        });

        const limits = await client(http).list(calls.read());

        expect([...limits]).toEqual([
            ["system.ai.claude-sonnet-4-6", { input: 1_000_000, output: 128_000 }],
            ["system.ai.model-a", { input: 922_000, output: 128_000 }],
            ["system.ai.model-b", { input: 922_000, output: 128_000 }],
        ]);
    });

    it("follows the pages, each after the last model of the one before", async () => {
        const entry = (id: string) => ({ id, max_input_tokens: 200_000, max_tokens: 32_000 });
        const http = new FakeHttpClient().on("GET", MODELS, (request) =>
            new URL(request.url).searchParams.get("after_id") === "system.ai.no-limits"
                ? { body: { data: [entry("system.ai.b")], has_more: false } }
                : {
                      body: {
                          data: [entry("system.ai.a"), { id: "system.ai.no-limits" }],
                          has_more: true,
                      },
                  },
        );

        const limits = await client(http).list(calls.read());

        expect([...limits.keys()]).toEqual(["system.ai.a", "system.ai.b"]);
        expect(http.requests.map((r) => new URL(r.url).searchParams.get("after_id"))).toEqual([
            null,
            "system.ai.no-limits",
        ]);
    });

    it.each([
        ["names no model", { data: [], has_more: true }],
        // Asked to start after the model it named, it answers the same page.
        ["ignores where to start", { data: [{ id: "system.ai.a" }], has_more: true }],
    ])("stops when a later page that says there's more %s", async (_, later) => {
        const http = new FakeHttpClient().on("GET", MODELS, (request) => ({
            body: new URL(request.url).searchParams.has("after_id")
                ? later
                : { data: [{ id: "system.ai.a" }], has_more: true },
        }));

        await client(http).list(calls.read());

        expect(http.requests).toHaveLength(2);
    });

    it("asks for every model in one page, on the connection's workspace", async () => {
        const http = new FakeHttpClient().on("GET", MODELS, { body: { data: [] } });

        expect((await client(http).list(calls.read())).size).toBe(0);

        const [request] = http.requests;
        expect(new URL(request!.url).searchParams.get("limit")).toBe("1000");
        expect(request!.headers?.get("X-Databricks-Workspace-Id")).toBe("123");
        expect(request!.headers?.get("Authorization")).toBe("Bearer dapi-1");
    });

    it("rejects with the gateway's error", async () => {
        const http = new FakeHttpClient().on("GET", MODELS, {
            status: 403,
            body: { error_code: "PERMISSION_DENIED", message: "no access" },
        });

        await expect(client(http).list(calls.read())).rejects.toMatchObject({
            message: "no access",
        });
    });
});
