import fs from "node:fs";
import path from "node:path";
import type { HttpRequest } from "@databricks/sdk-core/http";
import {
    CancellationError,
    CancellationTokenSource,
    LanguageModelChatMessage,
    LanguageModelChatMessageRole,
    LanguageModelChatToolMode,
    LanguageModelDataPart,
    LanguageModelError,
    LanguageModelPromptTsxPart,
    LanguageModelTextPart,
    LanguageModelToolCallPart,
    LanguageModelToolResultPart,
} from "vscode";
import type {
    CancellationToken,
    LanguageModelChatInformation,
    LanguageModelChatRequestMessage,
    LanguageModelResponsePart,
} from "vscode";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionState } from "../../kernel/connection/ConnectionService";
import type { TelemetryRecorder } from "../../kernel/telemetry/Telemetry";
import { registerFeatures } from "../../kernel/feature";
import { UNITY_GATEWAY_VENDOR } from "../../kernel/unity-gateway/UnityGatewayModels";
import { when } from "../../platform/reactive";
import { fakeFeatureHost, fakeKernel, fakeLog, fakeTelemetry } from "../../test-support/fakes";
import { FakeHttpClient, SCIM_ME, type FakeResponse } from "../../test-support/fakeHttp";
import { SERVERLESS_SESSION } from "../../test-support/sessionEnv";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode } from "../../test-support/vscode";
import { connection } from "../connection";
import { signInPrompt, unityGatewayChat } from "./index";
import { UnityGatewayChatProvider } from "./UnityGatewayChatProvider";

const A = "https://a.cloud.databricks.com";
const B = "https://b.cloud.databricks.com";
const MODEL_SERVICES = "/api/2.1/unity-catalog/model-services";
const RESPONSES = "/ai-gateway/mlflow/v1/responses";
const LIMITS = "/ai-gateway/anthropic/v1/models";
const tempDir = useTempDirs();

const sse = (...events: unknown[]) => ({
    chunks: events.map((event) => `data: ${JSON.stringify(event)}\n\n`),
});
const services = (...names: string[]) => ({
    body: {
        model_services: names.map((name) => ({
            name,
            supported_api_types: ["mlflow/v1/responses"],
        })),
    },
});
const model: LanguageModelChatInformation = {
    id: "system.ai.gpt-5",
    name: "gpt-5",
    family: "gpt-5",
    version: "1",
    maxInputTokens: 128_000,
    maxOutputTokens: 4_096,
    capabilities: { toolCalling: true },
};
const token = () => new CancellationTokenSource().token;
/** A Databricks error, as the gateway refuses a request. */
const refusal = (status: number, message: string): FakeResponse => ({
    status,
    body: { error_code: "ERROR", message },
});

type Route = (request: HttpRequest) => FakeResponse | Promise<FakeResponse>;

/** The real kernel with profile ug on B and DEFAULT on A, and the provider over its Unity Gateway sign-in. */
function setup(options: { session?: boolean; isCursor?: boolean; workspaceId?: string } = {}) {
    const file = tempDir().write(
        ".databrickscfg",
        `[DEFAULT]\nhost = ${A}\ntoken = dapi-a\n\n[ug]\nhost = ${B}\ntoken = dapi-b\n${options.workspaceId ? `workspace_id = ${options.workspaceId}\n` : ""}\n[u2m]\nhost = ${B}\nauth_type = databricks-cli\n`,
    );
    const routes: { models: Route; limits: Route; chat: Route; me: Route } = {
        me: () => ({ body: { userName: "me" } }),
        models: () => services("system.ai.gpt-5"),
        limits: () => ({ body: { data: [] } }),
        chat: () =>
            sse(
                { type: "response.output_text.delta", delta: "Hi" },
                { type: "response.completed" },
            ),
    };
    const http = new FakeHttpClient()
        .on("GET", SCIM_ME, (request) => routes.me(request))
        .on("GET", MODEL_SERVICES, (request) => routes.models(request))
        .on("GET", LIMITS, (request) => routes.limits(request))
        .on("POST", RESPONSES, (request) => routes.chat(request));
    const log = fakeLog();
    const kernel = fakeKernel({
        env: { DATABRICKS_CONFIG_FILE: file },
        httpClient: http,
        log,
        ...(options.session ? { host: SERVERLESS_SESSION } : {}),
        ...(options.isCursor ? { isCursor: true } : {}),
    });
    kernel.start();
    let relists = 0;
    const prompts: string[] = [];
    const telemetry = fakeTelemetry();
    const provider = new UnityGatewayChatProvider(
        telemetry.telemetry,
        kernel.unityGateway,
        log,
        (failure) => prompts.push(failure.kind),
        async () => {
            relists++;
            return [];
        },
    );
    return {
        kernel,
        gateway: kernel.unityGateway,
        provider,
        routes,
        log,
        telemetry: telemetry.events,
        relists: () => relists,
        prompts,
        listings: () => http.to(MODEL_SERVICES).length,
        chats: () => http.to(RESPONSES),
        /** The body of the nth chat request. */
        sent: (
            index = 0,
        ): {
            model: string;
            input: { type?: string; role?: string }[];
            tools: { name: string }[];
        } => {
            const body = http.to(RESPONSES)[index]?.body;
            return JSON.parse(typeof body === "string" ? body : "");
        },
        listModels: (cancellation: CancellationToken = token()) =>
            provider.provideLanguageModelChatInformation({ silent: true }, cancellation),
        errors: () =>
            log.entries
                .filter((e) => e.level === "error")
                .map((e) => [e.message, ...(e.data ?? [])]),
    };
}

/** Holds each response of a route until `release` answers it. */
function held(response: FakeResponse) {
    const waiting: (() => void)[] = [];
    return {
        route: () => new Promise<FakeResponse>((resolve) => waiting.push(() => resolve(response))),
        waiting: () => waiting.length,
        release: () => waiting.splice(0).forEach((resolve) => resolve()),
    };
}

/** Chats and returns the reported parts. */
async function chat(
    provider: UnityGatewayChatProvider,
    messages: LanguageModelChatRequestMessage[] = [LanguageModelChatMessage.User("Hi")],
    cancellation: CancellationToken = token(),
    reported: LanguageModelResponsePart[] = [],
    onPart?: () => void,
): Promise<LanguageModelResponsePart[]> {
    await provider.provideLanguageModelChatResponse(
        model,
        messages,
        {
            tools: [{ name: "read_file", description: "Reads." }],
            toolMode: LanguageModelChatToolMode.Auto,
        },
        {
            report: (part) => {
                reported.push(part);
                onPart?.();
            },
        },
        cancellation,
    );
    return reported;
}

const failure = (promise: Promise<unknown>) =>
    promise.then(
        () => undefined,
        (e: unknown) => e,
    );

beforeEach(() => vscode.reset());

describe("UnityGatewayChatProvider models", () => {
    it("lists no models while signed out", async () => {
        const s = setup();

        expect(await s.listModels()).toEqual([]);
        expect(s.listings()).toBe(0);
    });

    it("lists the sign-in's models for Chat, once per connection, and again for another workspace", async () => {
        const s = setup();
        s.routes.models = (request) =>
            services(new URL(request.url).origin === A ? "system.ai.on-a" : "system.ai.gpt-5");
        await s.gateway.signIn("ug");

        const models = await s.listModels();
        expect(models).toEqual([
            {
                id: "system.ai.gpt-5",
                name: "gpt-5",
                family: "gpt-5",
                version: "1",
                detail: "Databricks",
                maxInputTokens: 128_000,
                maxOutputTokens: 4_096,
                capabilities: { toolCalling: true, imageInput: false },
            },
        ]);
        expect(await s.listModels()).toEqual(models);
        expect(s.listings()).toBe(1);

        await s.gateway.signIn("DEFAULT");

        expect((await s.listModels()).map((m) => m.id)).toEqual(["system.ai.on-a"]);
        expect(s.listings()).toBe(2);
    });

    it("reports the gateway's token limits, leaving room for the reply, and the defaults for other models", async () => {
        const s = setup();
        s.routes.models = () =>
            services("system.ai.claude-opus-5-5", "system.ai.gemini-3-pro", "system.ai.odd");
        s.routes.limits = () => ({
            body: {
                data: [
                    {
                        id: "system.ai.claude-opus-5-5",
                        max_input_tokens: 1_000_000,
                        max_tokens: 128_000,
                    },
                    // No room for a prompt: not a usable limit.
                    { id: "system.ai.odd", max_input_tokens: 32_000, max_tokens: 32_000 },
                ],
            },
        });
        await s.gateway.signIn("ug");

        const models = await s.listModels();

        expect(models.map((m) => [m.id, m.maxInputTokens, m.maxOutputTokens])).toEqual([
            ["system.ai.claude-opus-5-5", 872_000, 128_000],
            ["system.ai.gemini-3-pro", 128_000, 4_096],
            ["system.ai.odd", 128_000, 4_096],
        ]);
    });

    it("shares one listing between concurrent lookups", async () => {
        const s = setup();
        const hold = held(services("system.ai.gpt-5"));
        s.routes.models = hold.route;
        await s.gateway.signIn("ug");
        await expect.poll(hold.waiting).toBe(1);

        const lookups = Promise.all([s.listModels(), s.listModels()]);
        hold.release();
        const [first, second] = await lookups;

        expect(first).toHaveLength(1);
        expect(second).toEqual(first);
        expect(s.listings()).toBe(1);
    });

    it("lists no models from a sign-in that changed while they were listed", async () => {
        const s = setup();
        const hold = held(services("system.ai.gpt-5"));
        s.routes.models = hold.route;
        await s.gateway.signIn("ug");
        await expect.poll(hold.waiting).toBe(1);

        const lookup = s.listModels();
        await s.gateway.signOut();
        hold.release();

        expect(await lookup).toEqual([]);
    });

    it("lists no models once disposed, even while listing", async () => {
        const s = setup();
        const hold = held(services("system.ai.gpt-5"));
        s.routes.models = hold.route;
        await s.gateway.signIn("ug");
        await expect.poll(hold.waiting).toBe(1);

        const lookup = s.listModels();
        s.provider.dispose();
        hold.release();

        expect(await lookup).toEqual([]);
        expect(await s.listModels()).toEqual([]);
    });

    it("lists no models when listing fails, logs why, and lists again next time", async () => {
        const s = setup();
        s.routes.models = () => ({
            status: 500,
            body: { error_code: "INTERNAL_ERROR", message: "backend down" },
        });
        await s.gateway.signIn("ug");
        await when(s.gateway.models, (m) => m.status === "error");

        expect(await s.listModels()).toEqual([]);
        expect(s.errors()).toEqual([
            [
                "Can't list Unity Gateway models",
                expect.objectContaining({ message: "backend down" }),
            ],
        ]);

        s.routes.models = () => services("system.ai.gpt-5");
        expect(await s.listModels()).toHaveLength(1);
    });

    it("stops waiting when the lookup is cancelled, without logging or stopping the listing", async () => {
        const s = setup();
        const hold = held(services("system.ai.gpt-5"));
        s.routes.models = hold.route;
        await s.gateway.signIn("ug");
        await expect.poll(hold.waiting).toBe(1);
        const cancellation = new CancellationTokenSource();

        const lookup = s.listModels(cancellation.token);
        cancellation.cancel();

        expect(await lookup).toEqual([]);
        expect(await s.listModels(cancellation.token)).toEqual([]);
        expect(s.errors()).toEqual([]);
        hold.release();
        expect(await s.listModels()).toHaveLength(1);
        expect(s.listings()).toBe(1);
    });

    it("asks VS Code to list again once the models are listed, and when the sign-in goes, but not while listing or after a failure", async () => {
        const s = setup();
        let changes = 0;
        s.provider.onDidChangeLanguageModelChatInformation(() => changes++);
        await s.gateway.signIn("ug");
        await when(s.gateway.models, (m) => m.status === "ready");
        expect([changes, s.relists()]).toEqual([1, 1]);

        await s.gateway.signOut();
        expect([changes, s.relists()]).toEqual([2, 2]);

        s.routes.models = () => ({
            status: 500,
            body: { error_code: "INTERNAL_ERROR", message: "backend down" },
        });
        await s.gateway.signIn("ug");
        await when(s.gateway.models, (m) => m.status === "error");
        expect([changes, s.relists()]).toEqual([2, 2]);
    });
});

describe("UnityGatewayChatProvider chat", () => {
    it("streams the reply's text and tool calls", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        s.routes.chat = () =>
            sse(
                { type: "response.output_text.delta", delta: "Hel" },
                { type: "response.output_text.delta", delta: "lo" },
                {
                    type: "response.output_item.done",
                    item: {
                        type: "function_call",
                        call_id: "call-1",
                        name: "read_file",
                        arguments: '{"path":"a.txt"}',
                    },
                },
                { type: "response.completed", response: {} },
            );

        expect(await chat(s.provider)).toEqual([
            new LanguageModelTextPart("Hel"),
            new LanguageModelTextPart("lo"),
            new LanguageModelToolCallPart("call-1", "read_file", { path: "a.txt" }),
        ]);
        const [request] = s.chats();
        expect(new URL(request.url).origin).toBe(B);
        expect(request.headers.get("authorization")).toBe("Bearer dapi-b");
    });

    it("sends the whole conversation and the tools each turn", async () => {
        const s = setup();
        await s.gateway.signIn("ug");

        await chat(s.provider);
        await chat(s.provider, [
            LanguageModelChatMessage.User("Hi"),
            LanguageModelChatMessage.Assistant([
                new LanguageModelToolCallPart("call-1", "read_file", {}),
            ]),
            LanguageModelChatMessage.User([
                new LanguageModelToolResultPart("call-1", [new LanguageModelTextPart("contents")]),
            ]),
        ]);

        expect(s.sent(0).model).toBe("system.ai.gpt-5");
        expect(s.sent(0).input).toHaveLength(1);
        expect(s.sent(1).input.map((item) => item.type ?? item.role)).toEqual([
            "user",
            "function_call",
            "function_call_output",
        ]);
        expect(s.sent(1).tools[0]?.name).toBe("read_file");
    });

    it("asks to sign in when signed out, with a plain error that has no stack", async () => {
        const s = setup();

        const error = await failure(chat(s.provider));

        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(LanguageModelError);
        expect(error).toMatchObject({
            message:
                "Sign in to Unity Gateway in the Databricks extension to use Databricks models.",
        });
        expect(error).not.toHaveProperty("stack");
        expect(s.chats()).toHaveLength(0);
    });

    it.each<[string, FakeResponse, string]>([
        [
            "401",
            refusal(401, "Invalid token"),
            "Unity Gateway returned HTTP 401: Invalid token. Sign in to Unity Gateway again.",
        ],
        [
            "403",
            refusal(403, "This user's rate limit is set to 0."),
            "Unity Gateway returned HTTP 403: This user's rate limit is set to 0. Ask a workspace admin for access, or choose another model.",
        ],
        [
            "404",
            refusal(404, "No such model"),
            "Unity Gateway returned HTTP 404: No such model. Choose another model.",
        ],
        [
            "404 with a question",
            refusal(404, "Was it renamed?"),
            "Unity Gateway returned HTTP 404: Was it renamed? Choose another model.",
        ],
        [
            "429",
            refusal(429, "Slow down!"),
            "Unity Gateway returned HTTP 429: Slow down! Try again later.",
        ],
        [
            "400",
            refusal(400, JSON.stringify({ error: { message: "Unknown name exclusiveMinimum" } })),
            "Unity Gateway returned HTTP 400: Unknown name exclusiveMinimum. If this keeps happening with this model, choose another model.",
        ],
        [
            "500, with no next step",
            refusal(500, "INTERNAL_ERROR: Could not route request."),
            "Unity Gateway returned HTTP 500: INTERNAL_ERROR: Could not route request.",
        ],
        [
            "a reason with a trailing line break",
            refusal(400, "Invalid JSON schema - object types do not support propertyNames\n"),
            "Unity Gateway returned HTTP 400: Invalid JSON schema - object types do not support propertyNames. If this keeps happening with this model, choose another model.",
        ],
        [
            "a long reason",
            refusal(429, "x".repeat(1000)),
            `Unity Gateway returned HTTP 429: ${"x".repeat(300)} … Try again later.`,
        ],
        [
            "a JSON message in the message",
            refusal(500, JSON.stringify({ error: { message: "Backend overloaded" } })),
            "Unity Gateway returned HTTP 500: Backend overloaded",
        ],
        [
            "an unwrapped JSON message in the message",
            refusal(500, JSON.stringify({ message: "Backend unreachable" })),
            "Unity Gateway returned HTTP 500: Backend unreachable",
        ],
        // Bodies that aren't Databricks errors, which the SDK reads no message from.
        [
            "a model's own error",
            { status: 500, body: { error: { message: "Overloaded" } } },
            "Unity Gateway returned HTTP 500: Overloaded",
        ],
        [
            "a guardrail",
            {
                status: 400,
                body: {
                    detail: {
                        error_code: "INVALID_PARAMETER_VALUE",
                        message:
                            "Guardrail 'pii-detection' blocked: input contains an email address.",
                    },
                },
            },
            "Unity Gateway returned HTTP 400: Guardrail 'pii-detection' blocked: input contains an email address. If this keeps happening with this model, choose another model.",
        ],
        [
            "plain text",
            {
                status: 503,
                chunks: [" upstream connect error\n"],
                headers: { "content-type": "text/plain" },
            },
            "Unity Gateway returned HTTP 503: upstream connect error",
        ],
        [
            "an HTML page",
            {
                status: 502,
                chunks: ["<html>Bad gateway</html>"],
                headers: { "content-type": "text/html" },
            },
            "Unity Gateway returned HTTP 502",
        ],
        [
            "an HTML page after a line break",
            {
                status: 502,
                chunks: ["\n<html>Bad Gateway</html>"],
                headers: { "content-type": "text/plain" },
            },
            "Unity Gateway returned HTTP 502",
        ],
        // The SDK's own reading comes first.
        [
            "a string error",
            { status: 502, body: { error: "Bad gateway" } },
            "Unity Gateway returned HTTP 502: Bad gateway",
        ],
        // JSON without a message says no more than the status.
        [
            "JSON without a message",
            { status: 429, body: { error_code: "RESOURCE_EXHAUSTED" } },
            "Unity Gateway returned HTTP 429. Try again later.",
        ],
        [
            "no body",
            { status: 404, chunks: [] },
            "Unity Gateway returned HTTP 404. Choose another model.",
        ],
    ])(
        "ends the turn with the gateway's reason and what to do next when it refuses (%s)",
        async (_name, response, message) => {
            const s = setup();
            await s.gateway.signIn("ug");
            s.routes.chat = () => response;

            const error = await failure(chat(s.provider));

            expect(error).toMatchObject({ message });
            expect(error).not.toBeInstanceOf(LanguageModelError);
            expect(error).not.toHaveProperty("stack");
        },
    );

    it("ends the turn when the reply fails partway, after what has streamed", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        s.routes.chat = () =>
            sse(
                { type: "response.output_text.delta", delta: "Hel" },
                { type: "response.failed", response: { error: { message: "backend exploded" } } },
            );
        const reported: LanguageModelResponsePart[] = [];

        await expect(chat(s.provider, undefined, undefined, reported)).rejects.toThrow(
            /backend exploded/,
        );
        expect(reported).toEqual([new LanguageModelTextPart("Hel")]);
    });

    it("shows a failure from outside the gateway whole", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        // As the CLI reports a sign-in it can't refresh.
        const message = `databricks-cli: cannot get access token: ${"x".repeat(500)} Re-authenticate: databricks auth login --profile ug`;
        s.routes.chat = () => Promise.reject(new Error(message));

        expect(await failure(chat(s.provider))).toMatchObject({ message });
    });

    it("ends the turn with what was thrown when it isn't an Error", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        s.routes.chat = () => Promise.reject("socket hang up");

        expect(await failure(chat(s.provider))).toMatchObject({ message: "socket hang up" });
    });

    it("shows the code of a connection that failed on every address", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        // As Node reports one when it tries each of a host's addresses.
        const refused = Object.assign(
            new AggregateError(
                [
                    new Error("connect ECONNREFUSED 127.0.0.1:443"),
                    new Error("connect ECONNREFUSED ::1:443"),
                ],
                "",
            ),
            {
                code: "ECONNREFUSED",
            },
        );
        s.routes.chat = () => Promise.reject(refused);

        expect(await failure(chat(s.provider))).toMatchObject({ message: "ECONNREFUSED" });
    });

    it("stops the request when the chat is cancelled", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        s.routes.chat = () => ({
            chunks: ['data: {"type":"response.output_text.delta","delta":"Hel"}\n\n'],
            open: true,
        });
        const cancellation = new CancellationTokenSource();

        const error = await failure(
            chat(s.provider, undefined, cancellation.token, [], () => cancellation.cancel()),
        );

        expect(error).toBeInstanceOf(CancellationError);
        const [request] = s.chats();
        expect(request.signal?.aborted).toBe(true);
        expect(s.errors()).toEqual([]);
    });

    it("logs a failed chat, and ends the turn with a new error that doesn't carry it", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        const refused = new Error("connect ECONNREFUSED");
        s.routes.chat = () => Promise.reject(refused);

        const thrown = await failure(chat(s.provider));

        expect(s.errors()).toEqual([
            [
                "Unity Gateway chat request failed",
                expect.objectContaining({ message: "connect ECONNREFUSED" }),
            ],
        ]);
        expect(thrown).toBeInstanceOf(Error);
        expect(thrown).not.toBe(refused);
        expect(thrown).toMatchObject({ message: "connect ECONNREFUSED" });
        expect(thrown).not.toHaveProperty("cause");
    });
});

describe("UnityGatewayChatProvider sign-in prompt", () => {
    afterEach(() => vi.useRealTimers());

    it("offers to sign in again when the gateway rejects the token", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        s.routes.chat = () => refusal(401, "Invalid token");

        await failure(chat(s.provider));

        expect(s.prompts).toEqual(["expired"]);
    });

    it("offers to sign in again when the CLI can't refresh the token", async () => {
        const s = setup();
        let tokens = 0;
        // The sign-in gets a token about to expire; once it has, refreshing it fails.
        vi.useFakeTimers({ toFake: ["Date"] });
        s.kernel.runner.on(["auth", "token"], () =>
            tokens++ === 0
                ? {
                      stdout: JSON.stringify({
                          access_token: "u2m-token",
                          token_type: "Bearer",
                          expiry: new Date(Date.now() + 1_000).toISOString(),
                      }),
                  }
                : {
                      exitCode: 1,
                      stderr: "Error: refresh token is invalid. Re-authenticate: databricks auth login --profile u2m",
                  },
        );
        await s.gateway.signIn("u2m");
        vi.setSystemTime(Date.now() + 2_000);

        const error = await failure(chat(s.provider));

        expect(error).toMatchObject({
            message:
                "Error: refresh token is invalid. Re-authenticate: databricks auth login --profile u2m",
        });
        expect(s.prompts).toEqual(["expired"]);
        expect(s.chats()).toHaveLength(0);
    });

    it.each<[string, Route]>([
        ["403", () => refusal(403, "No access")],
        ["500", () => refusal(500, "Backend down")],
        ["a network failure", () => Promise.reject(new Error("connect ECONNREFUSED"))],
    ])("doesn't offer to sign in when that wouldn't help (%s)", async (_name, route) => {
        const s = setup();
        await s.gateway.signIn("ug");
        s.routes.chat = route;

        await failure(chat(s.provider));

        expect(s.prompts).toEqual([]);
    });

    it("doesn't offer to sign in for a request on an old connection", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        const hold = held(refusal(401, "Invalid token"));
        s.routes.chat = hold.route;
        const turn = failure(chat(s.provider));
        await expect.poll(hold.waiting).toBe(1);

        await s.gateway.signIn("DEFAULT");
        hold.release();
        await turn;

        expect(s.prompts).toEqual([]);
    });

    it("offers to sign in while signed out, but not while switching workspace", async () => {
        const s = setup();
        await failure(chat(s.provider));
        expect(s.prompts).toEqual(["notConnected"]);

        await s.gateway.signIn("ug");
        const hold = held({ body: { userName: "me" } });
        s.routes.me = hold.route;
        const switching = s.gateway.signIn("DEFAULT");
        await when(s.gateway.state, (state) => state.status === "connecting");

        await failure(chat(s.provider));

        expect(s.prompts).toEqual(["notConnected"]);
        await expect.poll(hold.waiting).toBe(1);
        hold.release();
        await switching;
    });
});

describe("UnityGatewayChatProvider logs", () => {
    it("logs the extracted reason, not the full body, when a JSON body has a message", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        s.routes.chat = () => ({ status: 500, body: { error: { message: "Overloaded" } } });

        await failure(chat(s.provider));

        expect(s.errors().map(([message]) => message)).toEqual([
            "Unity Gateway chat request failed: Overloaded",
        ]);
    });

    it("logs the extracted reason from a guardrail, capping it to 300 characters", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        const reason = `Guardrail 'pii-detection' blocked: input contains sensitive data.${"x".repeat(500)}`;
        s.routes.chat = () => ({
            status: 400,
            body: {
                detail: {
                    error_code: "GUARDRAIL_VIOLATION",
                    message: reason,
                },
            },
        });

        await failure(chat(s.provider));

        const logged = s.errors().map(([message]) => message)[0];
        // The reason is extracted and capped at 300 chars, with " …" if cut.
        const expected = `Unity Gateway chat request failed: ${reason.substring(0, 300)} …`;
        expect(logged).toBe(expected);
    });

    it("does not log the raw response body, which may quote the request", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        const secret = "secret-value-12345";
        s.routes.chat = () => ({
            status: 400,
            body: {
                detail: {
                    error_code: "GUARDRAIL_VIOLATION",
                    message: "Guardrail blocked the input",
                    matched: secret,
                },
            },
        });

        await failure(chat(s.provider));

        const logged = JSON.stringify(s.errors());
        expect(logged).toContain("Guardrail blocked the input");
        expect(logged).not.toContain(secret);
    });

    it("logs the raw body capped to 4,096 characters when there is no extractable message", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        s.routes.chat = () => ({ status: 502, chunks: [`<html>${"x".repeat(10_000)}</html>`] });

        await failure(chat(s.provider));

        expect(s.errors().map(([message]) => message)).toEqual([
            `Unity Gateway chat request failed: <html>${"x".repeat(4_090)}…`,
        ]);
    });
});

describe("UnityGatewayChatProvider token counts", () => {
    it("estimates four characters per token, tool parts included", async () => {
        const { provider } = setup();

        expect(await provider.provideTokenCount(model, "abcde")).toBe(2);
        expect(
            await provider.provideTokenCount(
                model,
                LanguageModelChatMessage.Assistant([
                    new LanguageModelTextPart("abcd"),
                    new LanguageModelToolCallPart("call-1", "tool", { a: 1 }),
                ]),
            ),
        ).toBe(Math.ceil('abcdtool{"a":1}'.length / 4));
        expect(
            await provider.provideTokenCount(
                model,
                LanguageModelChatMessage.User([
                    new LanguageModelToolResultPart("call-1", [
                        new LanguageModelTextPart("x".repeat(400)),
                        new LanguageModelPromptTsxPart({ b: 2 }),
                    ]),
                ]),
            ),
        ).toBe(Math.ceil((400 + '{"b":2}'.length) / 4));
    });

    it("counts text and JSON data parts", async () => {
        const { provider } = setup();
        const message = {
            role: LanguageModelChatMessageRole.Assistant,
            name: undefined,
            content: [
                new LanguageModelToolResultPart("call-1", [
                    new LanguageModelDataPart(
                        new TextEncoder().encode('{"c":3}'),
                        "Application/JSON",
                    ),
                ]),
                new LanguageModelDataPart(new Uint8Array(1000), "text/plain"),
                new LanguageModelDataPart(new Uint8Array(1000), "image/png"),
            ],
        };

        expect(await provider.provideTokenCount(model, message)).toBe(
            Math.ceil(('{"c":3}'.length + 1000) / 4),
        );
    });
});

/** Registers only the chat feature, on a kernel with profile ug. */
function register(options: { session?: boolean; isCursor?: boolean } = {}) {
    const file = tempDir().write(".databrickscfg", `[ug]\nhost = ${B}\ntoken = dapi-b\n`);
    const kernel = fakeKernel({
        env: { DATABRICKS_CONFIG_FILE: file },
        httpClient: new FakeHttpClient(),
        ...(options.session ? { host: SERVERLESS_SESSION } : {}),
        ...(options.isCursor ? { isCursor: true } : {}),
    });
    return registerFeatures([unityGatewayChat], fakeFeatureHost(kernel).host);
}

const packageDir = path.resolve(__dirname, "../../..");

function declaredVendors(): {
    vendor: string;
    displayName: string;
    icon: { light: string; dark: string };
}[] {
    return JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf-8")).contributes
        .languageModelChatProviders;
}

describe("the Unity Gateway chat feature", () => {
    it("registers the provider for the declared vendor", () => {
        const [registered] = register();

        expect(declaredVendors()).toEqual([
            {
                vendor: UNITY_GATEWAY_VENDOR,
                displayName: "Databricks",
                icon: { light: "resources/light/logo.svg", dark: "resources/dark/logo.svg" },
            },
        ]);
        expect(vscode.chatProviders.get(UNITY_GATEWAY_VENDOR)).toBeInstanceOf(
            UnityGatewayChatProvider,
        );
        for (const d of registered?.ctx.subscriptions ?? []) {
            d.dispose();
        }
        expect(vscode.chatProviders.size).toBe(0);
    });

    it("ships the files of the vendor's icon", () => {
        // VS Code (1.143 and later) shows it on the vendor's tab in Chat's model picker, and
        // doesn't check that the files exist.
        for (const { icon } of declaredVendors()) {
            expect(fs.existsSync(path.join(packageDir, icon.light))).toBe(true);
            expect(fs.existsSync(path.join(packageDir, icon.dark))).toBe(true);
        }
    });

    it("prompts with a warning, and runs the sign-in command from its button", async () => {
        register();
        const provider = vscode.chatProviders.get(UNITY_GATEWAY_VENDOR);
        if (!(provider instanceof UnityGatewayChatProvider)) {
            throw new Error("No provider");
        }
        vscode.nextMessageChoice = "Sign in to Unity Gateway";

        await failure(chat(provider));

        await expect
            .poll(() => vscode.executed.map((e) => e.command))
            .toContain("databricks.unityGateway.signIn");
        expect(vscode.warnings).toEqual([
            {
                message: "You're not signed in to Unity Gateway.",
                actions: ["Sign in to Unity Gateway"],
            },
        ]);
    });

    it("signs in again from the prompt after the gateway refuses an OAuth token, then reconnects Unity Gateway", async () => {
        const s = setup();
        s.kernel.runner.on(["auth", "token"], {
            stdout: JSON.stringify({
                access_token: "u2m-token",
                token_type: "Bearer",
                expiry: new Date(Date.now() + 3600_000).toISOString(),
            }),
        });
        s.kernel.runner.on(["auth", "login"], {});
        registerFeatures([connection, unityGatewayChat], fakeFeatureHost(s.kernel).host);
        await s.gateway.signIn("u2m");
        const provider = vscode.chatProviders.get(UNITY_GATEWAY_VENDOR);
        if (!(provider instanceof UnityGatewayChatProvider)) {
            throw new Error("No provider");
        }
        s.routes.chat = () => refusal(401, "Invalid token");
        vscode.nextMessageChoice = "Sign in again";
        const before = s.gateway.connection;

        await failure(chat(provider));

        await when(s.gateway.state, (g) => g.status === "connected" && g.connection !== before);
        expect(vscode.warnings).toEqual([
            {
                message: "Your Unity Gateway sign-in, profile u2m, no longer works.",
                actions: ["Sign in again"],
            },
        ]);
        expect(s.kernel.runner.argv.filter((a) => a[1] === "login")).toEqual([
            expect.arrayContaining(["auth", "login", "--profile", "u2m"]),
        ]);
        expect(s.gateway.connection?.profile).toBe("u2m");
    });

    it("doesn't sign in when the prompt is dismissed", async () => {
        register();
        const provider = vscode.chatProviders.get(UNITY_GATEWAY_VENDOR);
        if (!(provider instanceof UnityGatewayChatProvider)) {
            throw new Error("No provider");
        }

        await failure(chat(provider));

        await expect.poll(() => vscode.warnings).toHaveLength(1);
        expect(vscode.executed.map((e) => e.command)).not.toContain(
            "databricks.unityGateway.signIn",
        );
    });

    it.each([{ session: true }, { isCursor: true }])(
        "registers nothing where the sign-in is off (%o)",
        (where) => {
            register(where);

            expect(vscode.chatProviders.size).toBe(0);
        },
    );
});

describe("signInPrompt", () => {
    const connection = (authType: string, profile = "pg") =>
        ({ host: A, profile, authType, userName: "me" }) as Extract<
            ConnectionState,
            { status: "connected" }
        >["connection"];
    const connected = (authType: string): ConnectionState => ({
        status: "connected",
        connection: connection(authType),
    });
    const failed = (remedy?: "signInAgain"): ConnectionState => ({
        status: "error",
        profile: "pg",
        host: A,
        error: new Error("x"),
        ...(remedy ? { remedy } : {}),
    });

    it("offers the Unity Gateway sign-in while signed out", () => {
        expect(
            signInPrompt({ kind: "notConnected" }, { status: "signedOut", reason: "x" }),
        ).toEqual({
            message: "You're not signed in to Unity Gateway.",
            button: "Sign in to Unity Gateway",
            action: { kind: "command", command: "databricks.unityGateway.signIn" },
        });
    });

    it("signs an OAuth session in again when the gateway refused its token, and opens Unity Gateway's menu for other auth types", () => {
        expect(
            signInPrompt(
                { kind: "expired", connection: connection("databricks-cli") },
                connected("databricks-cli"),
            ),
        ).toEqual({
            message: "Your Unity Gateway sign-in, profile pg, no longer works.",
            button: "Sign in again",
            action: { kind: "renew", profile: "pg", host: A },
        });
        expect(
            signInPrompt({ kind: "expired", connection: connection("pat") }, connected("pat")),
        ).toMatchObject({
            button: "Manage Unity Gateway connection",
            action: { command: "databricks.unityGateway.showMenu" },
        });
    });

    it("offers Sign in again for an expired session that isn't connected, else Unity Gateway's menu", () => {
        expect(signInPrompt({ kind: "notConnected" }, failed("signInAgain"))).toEqual({
            message: "Unity Gateway isn't connected.",
            button: "Sign in again",
            action: { kind: "command", command: "databricks.unityGateway.signInAgain" },
        });
        expect(signInPrompt({ kind: "notConnected" }, failed())).toEqual({
            message: "Unity Gateway isn't connected.",
            button: "Manage Unity Gateway connection",
            action: { kind: "command", command: "databricks.unityGateway.showMenu" },
        });
    });

    it("never offers the workspace sign-in", () => {
        const prompts = [
            signInPrompt({ kind: "notConnected" }, { status: "signedOut", reason: "x" }),
            signInPrompt({ kind: "notConnected" }, failed()),
            signInPrompt({ kind: "expired", connection: connection("pat") }, connected("pat")),
        ];
        for (const p of prompts) {
            expect(p.action).not.toMatchObject({
                command: expect.stringMatching(/^databricks\.connection\./),
            });
        }
    });
});

describe("UnityGatewayChatProvider telemetry", () => {
    it("records a completed reply once, with its counts and the connection", async () => {
        const s = setup({ workspaceId: "4242" });
        await s.gateway.signIn("ug");

        await chat(s.provider);

        expect(s.telemetry).toHaveLength(1);
        const [event] = s.telemetry;
        expect(event).toMatchObject({
            name: "unityGatewayChat",
            props: {
                "event.outcome": "ok",
                "event.model": s.sent(0).model,
                "event.replyStarted": "true",
                "event.workspaceId": "4242",
                "event.authType": s.gateway.connection?.authType,
            },
            metrics: {
                "event.messagesCount": 1,
                "event.toolsCount": 1,
                "event.duration": expect.any(Number),
                "event.timeToFirstPart": expect.any(Number),
            },
        });
        expect(event?.props).not.toHaveProperty("event.errorName");
        expect(event?.props).not.toHaveProperty("event.httpStatus");
    });

    it("records a reply that completed with nothing as empty, and still fails the turn", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        s.routes.chat = () => sse({ type: "response.completed", response: { id: "resp_1" } });

        expect(await failure(chat(s.provider))).toMatchObject({
            message: "Unity Gateway sent an empty reply (response resp_1).",
        });
        expect(s.telemetry).toHaveLength(1);
        expect(s.telemetry[0]?.props).toMatchObject({
            "event.outcome": "empty",
            "event.replyStarted": "true",
        });
        expect(s.telemetry[0]?.metrics).not.toHaveProperty("event.timeToFirstPart");
    });

    it("records a refusal with its status, the gateway's code and the error's class, not its message", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        s.routes.chat = () => ({
            status: 429,
            body: { error_code: "REQUEST_LIMIT_EXCEEDED", message: "Too many tokens for ada" },
        });

        await failure(chat(s.provider));

        expect(s.telemetry).toHaveLength(1);
        const [event] = s.telemetry;
        expect(event?.props).toMatchObject({
            "event.outcome": "failed",
            "event.errorCode": "REQUEST_LIMIT_EXCEEDED",
            "event.errorName": "ApiError",
            "event.replyStarted": "false",
        });
        expect(event?.metrics).toMatchObject({ "event.httpStatus": 429 });
        expect(JSON.stringify(event)).not.toContain("ada");
    });

    it("records a network failure with the code Node put on its cause", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        // As fetch rejects: a TypeError whose cause has the connection's code.
        s.routes.chat = () =>
            Promise.reject(
                new TypeError("fetch failed", {
                    cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), {
                        code: "ECONNREFUSED",
                    }),
                }),
            );

        await failure(chat(s.provider));

        expect(s.telemetry[0]?.props).toMatchObject({
            "event.outcome": "failed",
            "event.errorCode": "ECONNREFUSED",
            "event.errorName": "TypeError",
        });
        expect(s.telemetry[0]?.metrics).not.toHaveProperty("event.httpStatus");
        expect(JSON.stringify(s.telemetry[0])).not.toContain("127.0.0.1");
    });

    it("records a stream error with its code, after the reply started", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        s.routes.chat = () =>
            sse(
                { type: "response.output_text.delta", delta: "Hel" },
                {
                    type: "response.failed",
                    response: { error: { code: "server_error", message: "backend exploded" } },
                },
            );

        await failure(chat(s.provider));

        expect(s.telemetry[0]?.props).toMatchObject({
            "event.outcome": "failed",
            "event.errorCode": "server_error",
            "event.errorName": "StreamError",
            "event.replyStarted": "true",
        });
        expect(s.telemetry[0]?.metrics).toMatchObject({
            "event.timeToFirstPart": expect.any(Number),
        });
    });

    it("records a reply that stopped early with the gateway's reason", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        s.routes.chat = () =>
            sse(
                { type: "response.output_text.delta", delta: "Hel" },
                {
                    type: "response.incomplete",
                    response: { incomplete_details: { reason: "max_output_tokens" } },
                },
            );

        await failure(chat(s.provider));

        expect(s.telemetry[0]?.props).toMatchObject({
            "event.outcome": "failed",
            "event.stopReason": "max_output_tokens",
            "event.errorName": "IncompleteReplyError",
        });
    });

    it("records a cancelled chat as cancelled, with no failure fields", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        s.routes.chat = () => ({
            chunks: ['data: {"type":"response.output_text.delta","delta":"Hel"}\n\n'],
            open: true,
        });
        const cancellation = new CancellationTokenSource();

        await failure(
            chat(s.provider, undefined, cancellation.token, [], () => cancellation.cancel()),
        );

        expect(s.telemetry).toHaveLength(1);
        expect(s.telemetry[0]?.props).toMatchObject({ "event.outcome": "cancelled" });
        expect(s.telemetry[0]?.props).not.toHaveProperty("event.errorName");
        expect(s.telemetry[0]?.metrics).not.toHaveProperty("event.httpStatus");
    });

    it("records a request with no Unity Gateway connection as notConnected, without the connection's fields", async () => {
        const s = setup();

        expect(await failure(chat(s.provider))).toMatchObject({
            message: expect.stringContaining("Sign in to Unity Gateway"),
        });

        expect(s.telemetry).toHaveLength(1);
        const [event] = s.telemetry;
        expect(event?.props).toMatchObject({
            "event.outcome": "notConnected",
            "event.replyStarted": "false",
        });
        expect(event?.metrics).toMatchObject({ "event.messagesCount": 1 });
        expect(event?.props).not.toHaveProperty("event.authType");
        expect(event?.props).not.toHaveProperty("event.workspaceId");
    });

    it("records codes and class names of the wrong shape as other", async () => {
        const s = setup();
        await s.gateway.signIn("ug");

        s.routes.chat = () =>
            sse({
                type: "response.failed",
                response: { error: { code: "alice@example.com", message: "x" } },
            });
        await failure(chat(s.provider));

        s.routes.chat = () =>
            Promise.reject(
                new TypeError("fetch failed", {
                    cause: Object.assign(new Error("x"), { code: "connect to alice" }),
                }),
            );
        await failure(chat(s.provider));

        s.routes.chat = () =>
            Promise.reject(Object.assign(new Error("x"), { name: "Token_Error" }));
        await failure(chat(s.provider));

        expect(s.telemetry.map((e) => e.props["event.errorCode"])).toEqual([
            "other",
            "other",
            undefined,
        ]);
        expect(s.telemetry[2]?.props).toMatchObject({ "event.errorName": "other" });
        expect(JSON.stringify(s.telemetry)).not.toContain("alice");
    });

    it("returns the same reply and error when telemetry fails", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        const broken: TelemetryRecorder = {
            isEnabled: true,
            record: () => {},
            start: () => () => {
                throw new Error("reporter disposed");
            },
        };
        const provider = new UnityGatewayChatProvider(
            broken,
            s.gateway,
            s.log,
            () => {},
            async () => [],
        );
        try {
            expect(await chat(provider)).toEqual([new LanguageModelTextPart("Hi")]);

            s.routes.chat = () => Promise.reject(new Error("connect ECONNREFUSED"));
            expect(await failure(chat(provider))).toMatchObject({
                message: "connect ECONNREFUSED",
            });
            expect(s.errors()).toContainEqual([
                "Can't record a Unity Gateway chat request",
                expect.objectContaining({ message: "reporter disposed" }),
            ]);
        } finally {
            provider.dispose();
        }
    });

    it.each<[string, FakeResponse, string | undefined]>([
        [
            "a model's own error",
            {
                status: 400,
                body: { error: { code: "context_length_exceeded", message: "Too long" } },
            },
            "context_length_exceeded",
        ],
        [
            "a guardrail",
            {
                status: 400,
                body: { detail: { error_code: "INVALID_PARAMETER_VALUE", message: "Blocked" } },
            },
            "INVALID_PARAMETER_VALUE",
        ],
        [
            "a proxy's HTML page",
            { status: 502, text: "<html><body>Bad gateway</body></html>" },
            undefined,
        ],
        ["an empty body", { status: 502, text: "" }, undefined],
        [
            "JSON with only a message",
            { status: 500, body: { message: "Backend unreachable" } },
            undefined,
        ],
    ])(
        "records the code of a refusal with %s, and none when it has none",
        async (_, response, code) => {
            const s = setup();
            await s.gateway.signIn("ug");
            s.routes.chat = () => response;

            await failure(chat(s.provider));

            expect(s.telemetry).toHaveLength(1);
            const [event] = s.telemetry;
            expect(event?.props["event.errorCode"]).toBe(code);
            expect(event?.props).toMatchObject({
                "event.outcome": "failed",
                "event.errorName": "ApiError",
            });
            expect(event?.metrics).toMatchObject({ "event.httpStatus": response.status });
        },
    );

    it("records a reply whose stream ended before it finished by its own error name", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        s.routes.chat = () => sse({ type: "response.output_text.delta", delta: "Hel" });

        expect(await failure(chat(s.provider))).toMatchObject({
            message: "Unity Gateway ended the reply before it finished.",
        });
        expect(s.telemetry[0]?.props).toMatchObject({
            "event.outcome": "failed",
            "event.errorName": "UnfinishedReplyError",
            "event.replyStarted": "true",
        });
    });

    it("records a successful reply with no body as empty, as one that completed with nothing", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        s.routes.chat = () => ({ noBody: true });

        expect(await failure(chat(s.provider))).toMatchObject({
            message: "Unity Gateway sent an empty reply.",
        });
        expect(s.telemetry).toHaveLength(1);
        expect(s.telemetry[0]?.props).toMatchObject({
            "event.outcome": "empty",
            "event.replyStarted": "false",
        });
        expect(s.telemetry[0]?.props).not.toHaveProperty("event.errorName");
    });

    it("records one event when the request fails before it's sent", async () => {
        const s = setup();
        await s.gateway.signIn("ug");
        const throwing: CancellationToken = {
            isCancellationRequested: false,
            onCancellationRequested: () => {
                throw new Error("listener failed");
            },
        };

        expect(await failure(chat(s.provider, undefined, throwing))).toMatchObject({
            message: "listener failed",
        });
        expect(s.telemetry).toHaveLength(1);
        expect(s.telemetry[0]?.props).toMatchObject({
            "event.outcome": "failed",
            "event.errorName": "Error",
        });
    });

    it("records a request with no connection even when offering to sign in fails", async () => {
        const s = setup();
        const telemetry = fakeTelemetry();
        const provider = new UnityGatewayChatProvider(
            telemetry.telemetry,
            s.gateway,
            s.log,
            () => {
                throw new Error("prompt failed");
            },
            async () => [],
        );
        try {
            await failure(chat(provider));

            expect(telemetry.events).toHaveLength(1);
            expect(telemetry.events[0]?.props).toMatchObject({ "event.outcome": "notConnected" });
        } finally {
            provider.dispose();
        }
    });
});
