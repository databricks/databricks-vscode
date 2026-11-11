import type { HttpRequest } from "@databricks/sdk-core/http";
import { describe, expect, it } from "vitest";
import { liveListenerCount } from "../../platform/event";
import { when } from "../../platform/reactive";
import { fakeKernel, fakeLog } from "../../test-support/fakes";
import { FakeHttpClient, SCIM_ME, type FakeResponse } from "../../test-support/fakeHttp";
import { SERVERLESS_SESSION } from "../../test-support/sessionEnv";
import { useTempDirs } from "../../test-support/tempDir";
import { UnityGatewayModels } from "./UnityGatewayModels";

const A = "https://a.cloud.databricks.com";
const B = "https://b.cloud.databricks.com";
const MODEL_SERVICES = "/api/2.1/unity-catalog/model-services";
const LIMITS = "/ai-gateway/anthropic/v1/models";
const tempDir = useTempDirs();

const responses = (...names: string[]) =>
    names.map((name) => ({ name, supported_api_types: ["mlflow/v1/responses"] }));

type Route = (request: HttpRequest) => FakeResponse | Promise<FakeResponse>;

/**
 * The real kernel, with profile ug on B and DEFAULT on A; `models` answers the
 * model-services listing, and `limits` the token limits (unrouted: a 404).
 */
function setup(models: Route, limits?: Route) {
    const file = tempDir().write(
        ".databrickscfg",
        `[DEFAULT]\nhost = ${A}\ntoken = dapi-a\n\n[ug]\nhost = ${B}\ntoken = dapi-b\n`,
    );
    const http = new FakeHttpClient()
        .on("GET", SCIM_ME, { body: { userName: "me" } })
        .on("GET", MODEL_SERVICES, models);
    if (limits !== undefined) {
        http.on("GET", LIMITS, limits);
    }
    const log = fakeLog();
    const kernel = fakeKernel({ env: { DATABRICKS_CONFIG_FILE: file }, httpClient: http, log });
    kernel.start();
    const gateway = kernel.unityGateway;
    return {
        gateway,
        models: gateway.models,
        listings: () => http.to(MODEL_SERVICES),
        limitListings: () => http.to(LIMITS),
        warnings: () => log.entries.filter((e) => e.level === "warn"),
        settled: () => when(gateway.models, (s) => s.status === "ready" || s.status === "error"),
        dispose: () => kernel.dispose(),
    };
}

/** Holds each listing until `release` answers it. */
function held() {
    const waiting: ((response: FakeResponse) => void)[] = [];
    return {
        respond: () => new Promise<FakeResponse>((resolve) => waiting.push(resolve)),
        waiting: () => waiting.length,
        release: (response: FakeResponse) =>
            waiting.splice(0).forEach((resolve) => resolve(response)),
    };
}

describe("UnityGatewayModels", () => {
    it("lists the system.ai models on the unified Responses route once the sign-in connects, sorted by name", async () => {
        const s = setup(() => ({
            body: {
                model_services: [
                    {
                        name: "model-services/system.ai.gpt-5",
                        supported_api_types: ["openai/v1/responses", "mlflow/v1/responses"],
                    },
                    {
                        name: "system.ai.claude-sonnet",
                        supported_api_types: ["mlflow/v1/responses"],
                    },
                    {
                        name: "system.ai.grok",
                        supported_api_types: ["mlflow/v1/chat/completions", "openai/v1/responses"],
                    },
                    { name: "system.ai.embeddings", supported_api_types: ["openai/v1/embeddings"] },
                    { name: "system.ai.no-routes" },
                    { supported_api_types: ["mlflow/v1/responses"] },
                ],
            },
        }));
        expect(s.models.value).toEqual({ status: "idle" });

        await s.gateway.signIn("ug");
        const state = await s.settled();

        expect(state).toEqual({
            status: "ready",
            value: [
                { id: "system.ai.claude-sonnet", name: "claude-sonnet", family: "claude-sonnet" },
                { id: "system.ai.gpt-5", name: "gpt-5", family: "gpt-5" },
            ],
        });
        const [listing] = s.listings();
        const url = new URL(listing.url);
        expect(url.origin).toBe(B);
        expect(url.searchParams.get("parent")).toBe("schemas/system.ai");
    });

    it("adds the token limits the gateway reports to the models it reports them for", async () => {
        const s = setup(
            () => ({
                body: {
                    model_services: responses(
                        "model-services/system.ai.claude-opus-5-5",
                        "model-services/system.ai.model-a",
                        "model-services/system.ai.gemini-3-pro",
                    ),
                },
            }),
            () => ({
                body: {
                    data: [
                        {
                            id: "system.ai.claude-opus-5-5",
                            max_input_tokens: 1_000_000,
                            max_tokens: 128_000,
                        },
                        {
                            id: "anthropic-aigw-0a1b2c3d-system.ai.model-a",
                            max_input_tokens: 922_000,
                            max_tokens: 128_000,
                        },
                        {
                            id: "system.ai.claude-haiku-4-5",
                            max_input_tokens: 200_000,
                            max_tokens: 64_000,
                        },
                    ],
                },
            }),
        );
        await s.gateway.signIn("ug");

        expect(await s.models.list()).toStrictEqual([
            {
                id: "system.ai.claude-opus-5-5",
                name: "claude-opus-5-5",
                family: "claude-opus-5-5",
                limits: { input: 1_000_000, output: 128_000 },
            },
            { id: "system.ai.gemini-3-pro", name: "gemini-3-pro", family: "gemini-3-pro" },
            {
                id: "system.ai.model-a",
                name: "model-a",
                family: "model-a",
                limits: { input: 922_000, output: 128_000 },
            },
        ]);
        const [request] = s.limitListings();
        expect(new URL(request!.url).origin).toBe(B);
        expect(s.warnings()).toEqual([]);
    });

    it.each([
        ["refuses", { status: 500, body: { error_code: "INTERNAL_ERROR", message: "boom" } }],
        ["answers with something else", { body: { data: "not a list" } }],
    ])(
        "lists the models without limits, and logs why, when the gateway %s",
        async (_, answer: FakeResponse) => {
            const s = setup(
                () => ({ body: { model_services: responses("system.ai.a") } }),
                () => answer,
            );
            await s.gateway.signIn("ug");

            expect(await s.models.list()).toStrictEqual([
                { id: "system.ai.a", name: "a", family: "a" },
            ]);
            expect(s.warnings()).toMatchObject([
                { message: "Can't list Unity Gateway's model token limits" },
            ]);
        },
    );

    it("lists the models without limits, and says so, when the limits take too long", async () => {
        const s = setup(
            () => ({ body: { model_services: responses("system.ai.a") } }),
            () => new Promise<FakeResponse>(() => {}),
        );
        const log = fakeLog();
        const models = new UnityGatewayModels(s.gateway.state, log, undefined, 20);
        await s.gateway.signIn("ug");

        expect(await models.list()).toStrictEqual([{ id: "system.ai.a", name: "a", family: "a" }]);
        expect(log.entries.map((e) => [e.level, e.message])).toEqual([
            ["warn", "Unity Gateway didn't list its model token limits within 0.02 seconds"],
        ]);
        models.dispose();
        s.dispose();
    });

    it("stops asking for the limits when the listing fails, and logs nothing about them", async () => {
        const limits = held();
        const s = setup(
            () => ({ status: 403, body: { error_code: "PERMISSION_DENIED", message: "no" } }),
            limits.respond,
        );
        await s.gateway.signIn("ug");

        await expect(s.models.list()).rejects.toThrow("no");

        expect(s.limitListings().length).toBeGreaterThan(0);
        expect(s.limitListings().every((r) => r.signal?.aborted)).toBe(true);
        expect(s.warnings()).toEqual([]);
    });

    it("lists every page", async () => {
        const s = setup((request) =>
            new URL(request.url).searchParams.get("page_token") === "page-2"
                ? { body: { model_services: responses("system.ai.b") } }
                : { body: { model_services: responses("system.ai.a"), next_page_token: "page-2" } },
        );
        await s.gateway.signIn("ug");

        expect(await s.models.list()).toEqual([
            { id: "system.ai.a", name: "a", family: "a" },
            { id: "system.ai.b", name: "b", family: "b" },
        ]);
        expect(s.listings()).toHaveLength(2);
    });

    it("lists once per connection, and again for another workspace", async () => {
        const s = setup((request) => ({
            body: {
                model_services: responses(
                    new URL(request.url).origin === A ? "system.ai.on-a" : "system.ai.on-b",
                ),
            },
        }));
        await s.gateway.signIn("ug");
        expect((await s.models.list()).map((m) => m.name)).toEqual(["on-b"]);
        await s.models.list();
        expect(s.listings()).toHaveLength(1);

        await s.gateway.signIn("DEFAULT");

        expect((await s.models.list()).map((m) => m.name)).toEqual(["on-a"]);
        expect(s.listings()).toHaveLength(2);
    });

    it("has no models while signed out, and forgets them on sign-out", async () => {
        const s = setup(() => ({ body: { model_services: responses("system.ai.a") } }));
        expect(await s.models.list()).toEqual([]);
        await s.gateway.signIn("ug");
        await s.settled();

        await s.gateway.signOut();

        expect(s.models.value).toEqual({ status: "idle" });
        expect(await s.models.list()).toEqual([]);
        expect(s.listings()).toHaveLength(1);
    });

    it("keeps a failed listing's error, and lists again on the next request", async () => {
        let fail = true;
        const s = setup(() =>
            fail
                ? {
                      status: 403,
                      body: {
                          error_code: "PERMISSION_DENIED",
                          message: "User does not have USE CATALOG on system",
                      },
                  }
                : { body: { model_services: responses("system.ai.a") } },
        );
        await s.gateway.signIn("ug");
        const failed = await s.settled();
        expect(failed.status === "error" && failed.error.message).toMatch(/USE CATALOG/);
        await expect(s.models.list()).rejects.toThrow(/USE CATALOG/);
        expect(s.listings()).toHaveLength(2);

        fail = false;

        expect((await s.models.list()).map((m) => m.name)).toEqual(["a"]);
        expect(s.listings()).toHaveLength(3);
    });

    it("hands back no models from a connection that went while they were listed, and stops listing", async () => {
        const hold = held();
        const s = setup(hold.respond);
        await s.gateway.signIn("ug");
        await expect.poll(hold.waiting).toBe(1);
        const listing = s.models.list();

        await s.gateway.signOut();
        hold.release({ body: { model_services: responses("system.ai.a") } });

        expect(await listing).toEqual([]);
        expect(s.models.value).toEqual({ status: "idle" });
        const [request] = s.listings();
        expect(request.signal?.aborted).toBe(true);
    });

    it("times out across all the pages, when the listing hangs", async () => {
        const s = setup((request) => {
            const page = Number(new URL(request.url).searchParams.get("page_token") ?? "1");
            return new Promise((resolve) =>
                setTimeout(
                    () =>
                        resolve({
                            body: {
                                model_services: [],
                                next_page_token: page < 4 ? String(page + 1) : undefined,
                            },
                        }),
                    15,
                ),
            );
        });
        const models = new UnityGatewayModels(s.gateway.state, fakeLog(), 40);
        await s.gateway.signIn("ug");

        const error = await models.list().then(
            () => undefined,
            (e: unknown) => e,
        );
        expect(error).toMatchObject({
            message: "Unity Gateway didn't list its models within 0.04 seconds.",
            cause: { name: "CancelledError" },
        });
        models.dispose();
    });

    it("lists at once when made after the sign-in connected", async () => {
        const s = setup(() => ({ body: { model_services: responses("system.ai.a") } }));
        await s.gateway.signIn("ug");
        await s.settled();

        const models = new UnityGatewayModels(s.gateway.state, fakeLog());

        expect((await models.list()).map((m) => m.name)).toEqual(["a"]);
        expect(s.listings()).toHaveLength(2);
        models.dispose();
    });

    it("stops following the sign-in once disposed", async () => {
        const s = setup(() => ({ body: { model_services: responses("system.ai.a") } }));
        const listeners = liveListenerCount();
        const models = new UnityGatewayModels(s.gateway.state, fakeLog());
        models.dispose();
        expect(liveListenerCount()).toBe(listeners);

        await s.gateway.signIn("ug");
        await s.settled();

        // Only the kernel's own listing.
        expect(s.listings()).toHaveLength(1);
        expect(models.value).toEqual({ status: "idle" });
    });

    it("lists nothing while unavailable", async () => {
        const file = tempDir().write(".databrickscfg", `[ug]\nhost = ${B}\ntoken = dapi-b\n`);
        const kernel = fakeKernel({
            env: { DATABRICKS_CONFIG_FILE: file },
            httpClient: new FakeHttpClient(),
            host: SERVERLESS_SESSION,
        });
        kernel.start();

        expect(await kernel.unityGateway.models.list()).toEqual([]);
        expect(kernel.unityGateway.models.value).toEqual({ status: "idle" });
    });
});
