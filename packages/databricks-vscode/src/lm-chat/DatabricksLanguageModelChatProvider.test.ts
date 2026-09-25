/* eslint-disable @typescript-eslint/naming-convention */
import assert from "assert";
import {CancellationToken, env, EventEmitter} from "vscode";
import type {ConnectionState} from "../configuration/ConnectionManager";
import {
    DatabricksLanguageModelChatProvider,
    registerDatabricksLanguageModelChatProvider,
} from "./DatabricksLanguageModelChatProvider";
import {
    discoverUnityGatewayModels,
    requestUnityGateway,
} from "./UnityGatewayClient";
import type {
    LanguageModelChatConnection,
    LanguageModelResponsePart,
    LanguageModelToolCallPart,
    LanguageModelToolResultPart,
} from "./types";

const NEVER_CANCELLED_TOKEN: CancellationToken = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({dispose: () => undefined}),
};

const UNITY_GATEWAY_LANGUAGE_MODEL = {
    id: "system.ai.gpt-5-6-sol",
    name: "gpt-5-6-sol",
    family: "gpt-5-6-sol",
    version: "1",
    maxInputTokens: 128_000,
    maxOutputTokens: 4_096,
    tooltip: "Uses a Unity Catalog model service",
    detail: "Databricks",
    capabilities: {
        imageInput: false,
        toolCalling: true,
    },
};

function asSseResponse(chunks: readonly unknown[]): Response {
    return new Response(
        `${chunks
            .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
            .join("")}data: [DONE]\n\n`,
        {
            status: 200,
            headers: {"Content-Type": "text/event-stream"},
        }
    );
}

function asStreamingResponse(response: unknown): Response {
    const message = (
        response as {
            choices?: Array<{message?: Record<string, unknown>}>;
        }
    ).choices?.[0]?.message;
    assert.ok(message);
    const {tool_calls: toolCalls, ...delta} = message;
    const chunks = [
        {
            id: "chatcmpl-test",
            object: "chat.completion.chunk",
            created: 0,
            model: "system.ai.test",
            choices: [
                {
                    index: 0,
                    delta: {
                        ...delta,
                        ...(Array.isArray(toolCalls)
                            ? {
                                  tool_calls: toolCalls.map(
                                      (toolCall, index) => ({
                                          ...(toolCall as object),
                                          index,
                                      })
                                  ),
                              }
                            : {}),
                    },
                    finish_reason: null,
                },
            ],
        },
        {
            id: "chatcmpl-test",
            object: "chat.completion.chunk",
            created: 0,
            model: "system.ai.test",
            choices: [
                {
                    index: 0,
                    delta: {},
                    finish_reason: Array.isArray(toolCalls)
                        ? "tool_calls"
                        : "stop",
                },
            ],
        },
    ];
    return asSseResponse(chunks);
}

class TestConnection implements LanguageModelChatConnection {
    private readonly onDidChangeStateEmitter =
        new EventEmitter<ConnectionState>();
    readonly onDidChangeState = this.onDidChangeStateEmitter.event;
    apiClient: LanguageModelChatConnection["apiClient"];
    databricksWorkspace: {readonly id: string} | undefined;
    readonly ensureConnectedCalls: boolean[] = [];

    constructor(
        public state: ConnectionState,
        private readonly request: (options: {
            readonly path: string;
            readonly method: string;
            readonly query?: Record<string, unknown>;
            readonly headers: Headers;
            readonly payload?: unknown;
        }) => Promise<unknown> = async () => ({model_services: []}),
        workspaceId = "1234567890"
    ) {
        this.apiClient = {
            host: Promise.resolve(
                new URL("https://workspace.example.databricks.com")
            ),
            config: {
                workspaceId,
                authenticate: async (headers) => {
                    headers.set("Authorization", "Bearer test-token");
                },
            },
        };
        this.databricksWorkspace = {id: workspaceId};
    }

    async ensureConnected(interactive: boolean): Promise<void> {
        this.ensureConnectedCalls.push(interactive);
    }

    readonly fetcher: typeof fetch = async (input, init) => {
        const url = new URL(input.toString());
        const payload =
            typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
        const response = await this.request({
            path: url.pathname,
            method: init?.method ?? "GET",
            query: Object.fromEntries(url.searchParams),
            headers: new Headers(init?.headers),
            payload,
        });
        if (payload?.stream === true) {
            return asStreamingResponse(response);
        }
        return new Response(JSON.stringify(response), {
            status: 200,
            headers: {"Content-Type": "application/json"},
        });
    };

    setState(state: ConnectionState): void {
        this.state = state;
        this.onDidChangeStateEmitter.fire(state);
    }

    dispose(): void {
        this.onDidChangeStateEmitter.dispose();
    }
}

function discoverWith(connection: TestConnection) {
    return (
        requestConnection: LanguageModelChatConnection,
        token: CancellationToken
    ) =>
        discoverUnityGatewayModels(
            requestConnection,
            token,
            connection.fetcher
        );
}

describe(__filename, () => {
    it("does not register the chat provider in Cursor", () => {
        const connection = new TestConnection("CONNECTED");
        const original = Object.getOwnPropertyDescriptor(env, "uriScheme");
        Object.defineProperty(env, "uriScheme", {
            value: "cursor",
            configurable: true,
        });
        try {
            const provider = new DatabricksLanguageModelChatProvider(
                connection
            );
            assert.strictEqual(
                registerDatabricksLanguageModelChatProvider(provider),
                undefined
            );
            provider.dispose();
        } finally {
            if (original) {
                Object.defineProperty(env, "uriScheme", original);
            }
        }
    });

    it("offers discovered Unity Gateway models only while connected", async () => {
        const connection = new TestConnection("DISCONNECTED");
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            undefined,
            async () => [UNITY_GATEWAY_LANGUAGE_MODEL]
        );

        assert.deepStrictEqual(
            await provider.provideLanguageModelChatInformation(
                {silent: true},
                NEVER_CANCELLED_TOKEN
            ),
            []
        );

        connection.setState("CONNECTED");
        assert.deepStrictEqual(
            await provider.provideLanguageModelChatInformation(
                {silent: true},
                NEVER_CANCELLED_TOKEN
            ),
            [UNITY_GATEWAY_LANGUAGE_MODEL]
        );

        provider.dispose();
        connection.dispose();
    });

    it("allows interactive model discovery to establish a connection", async () => {
        const connection = new TestConnection("DISCONNECTED");
        connection.ensureConnected = async (interactive) => {
            connection.ensureConnectedCalls.push(interactive);
            if (interactive) {
                connection.setState("CONNECTED");
            }
        };
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            undefined,
            async () => [UNITY_GATEWAY_LANGUAGE_MODEL]
        );

        assert.deepStrictEqual(
            await provider.provideLanguageModelChatInformation(
                {silent: false},
                NEVER_CANCELLED_TOKEN
            ),
            [UNITY_GATEWAY_LANGUAGE_MODEL]
        );
        assert.deepStrictEqual(connection.ensureConnectedCalls, [true]);

        provider.dispose();
        connection.dispose();
    });

    it("retries model discovery after a transient failure", async () => {
        const connection = new TestConnection("CONNECTED");
        let attempts = 0;
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            undefined,
            async () => {
                attempts++;
                if (attempts === 1) {
                    throw new Error("temporary failure");
                }
                return [UNITY_GATEWAY_LANGUAGE_MODEL];
            }
        );

        assert.deepStrictEqual(
            await provider.provideLanguageModelChatInformation(
                {silent: true},
                NEVER_CANCELLED_TOKEN
            ),
            []
        );
        assert.deepStrictEqual(
            await provider.provideLanguageModelChatInformation(
                {silent: true},
                NEVER_CANCELLED_TOKEN
            ),
            [UNITY_GATEWAY_LANGUAGE_MODEL]
        );

        provider.dispose();
        connection.dispose();
    });

    it("announces model-list changes when connection state changes", () => {
        const connection = new TestConnection("DISCONNECTED");
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            undefined,
            discoverWith(connection)
        );
        let changes = 0;
        provider.onDidChangeLanguageModelChatInformation(() => changes++);

        connection.setState("CONNECTED");

        assert.strictEqual(changes, 1);
        provider.dispose();
        connection.dispose();
    });

    it("announces the model count after a fresh discovery", async () => {
        const connection = new TestConnection("CONNECTED");
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            undefined,
            async () => [
                UNITY_GATEWAY_LANGUAGE_MODEL,
                UNITY_GATEWAY_LANGUAGE_MODEL,
            ]
        );
        const counts: number[] = [];
        provider.onDidDiscoverModels((count) => counts.push(count));

        await provider.provideLanguageModelChatInformation(
            {silent: true},
            NEVER_CANCELLED_TOKEN
        );
        // A cached second call must not re-announce.
        await provider.provideLanguageModelChatInformation(
            {silent: true},
            NEVER_CANCELLED_TOKEN
        );

        assert.deepStrictEqual(counts, [2]);
        provider.dispose();
        connection.dispose();
    });

    it("requests sign-in once on silent discovery while disconnected", async () => {
        const connection = new TestConnection("DISCONNECTED");
        const provider = new DatabricksLanguageModelChatProvider(connection);
        let signInRequests = 0;
        provider.onDidRequestSignIn(() => signInRequests++);

        const first = await provider.provideLanguageModelChatInformation(
            {silent: true},
            NEVER_CANCELLED_TOKEN
        );
        // A second silent poll must not re-prompt.
        const second = await provider.provideLanguageModelChatInformation(
            {silent: true},
            NEVER_CANCELLED_TOKEN
        );

        assert.deepStrictEqual(first, []);
        assert.deepStrictEqual(second, []);
        assert.strictEqual(signInRequests, 1);
        provider.dispose();
        connection.dispose();
    });

    it("does not request sign-in during interactive discovery", async () => {
        const connection = new TestConnection("DISCONNECTED");
        const provider = new DatabricksLanguageModelChatProvider(connection);
        let signInRequests = 0;
        provider.onDidRequestSignIn(() => signInRequests++);

        await provider.provideLanguageModelChatInformation(
            {silent: false},
            NEVER_CANCELLED_TOKEN
        );

        assert.strictEqual(signInRequests, 0);
        provider.dispose();
        connection.dispose();
    });

    it("returns no models without an API client", async () => {
        const connection = new TestConnection("CONNECTED");
        connection.apiClient = undefined;
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            undefined,
            discoverWith(connection)
        );

        assert.deepStrictEqual(
            await provider.provideLanguageModelChatInformation(
                {silent: true},
                NEVER_CANCELLED_TOKEN
            ),
            []
        );

        provider.dispose();
        connection.dispose();
    });

    it("maps model discovery permission failures", async () => {
        const connection = new TestConnection("CONNECTED", async () => {
            throw Object.assign(new Error("Forbidden"), {statusCode: 403});
        });
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            undefined,
            discoverWith(connection)
        );

        await assert.rejects(
            provider.provideLanguageModelChatInformation(
                {silent: true},
                NEVER_CANCELLED_TOKEN
            ),
            (error: Error & {code?: string}) => error.code === "NoPermissions"
        );

        provider.dispose();
        connection.dispose();
    });

    it("discovers accessible text model services from system.ai", async () => {
        let requestedPath: string | undefined;
        let requestedQuery: unknown;
        let sentWorkspaceId: string | null = null;
        const connection = new TestConnection("CONNECTED", async (options) => {
            requestedPath = options.path;
            requestedQuery = options.query;
            sentWorkspaceId = options.headers.get("X-Databricks-Org-Id");
            return {
                model_services: [
                    {
                        name: "model-services/system.ai.gpt-test",
                        supported_api_types: ["openai/v1/chat/completions"],
                    },
                    {
                        name: "model-services/system.ai.claude-test",
                        supported_api_types: ["chat"],
                    },
                    {
                        name: "model-services/system.ai.grok-test",
                        supported_api_types: ["chat"],
                    },
                    {
                        name: "model-services/system.ai.meta-llama-test",
                        supported_api_types: ["chat"],
                    },
                    {
                        name: "model-services/system.ai.gemini-test",
                        supported_api_types: ["chat"],
                    },
                    {
                        name: "model-services/system.ai.deepseek-test",
                        supported_api_types: ["chat"],
                    },
                    {
                        name: "model-services/system.ai.embedding-test",
                        supported_api_types: ["openai/v1/embeddings"],
                    },
                ],
            };
        });
        // The active ApiClient can know the workspace ID even when the
        // current-user response did not populate DatabricksWorkspace.id.
        connection.databricksWorkspace = undefined;
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            undefined,
            discoverWith(connection)
        );

        const models = await provider.provideLanguageModelChatInformation(
            {silent: true},
            NEVER_CANCELLED_TOKEN
        );

        assert.deepStrictEqual(
            models.map((model) => model.id),
            [
                "system.ai.claude-test",
                "system.ai.deepseek-test",
                "system.ai.gemini-test",
                "system.ai.gpt-test",
                "system.ai.grok-test",
                "system.ai.meta-llama-test",
            ]
        );
        assert.deepStrictEqual(
            new Map(
                models.map((model) => [
                    model.id,
                    model.capabilities.toolCalling,
                ])
            ),
            new Map([
                ["system.ai.gpt-test", true],
                ["system.ai.claude-test", true],
                ["system.ai.grok-test", true],
                ["system.ai.meta-llama-test", true],
                ["system.ai.gemini-test", true],
                ["system.ai.deepseek-test", true],
            ])
        );
        assert.strictEqual(
            models.find((model) => model.id.includes("gemini"))?.name,
            "gemini-test"
        );
        assert.strictEqual(
            models.find((model) => model.id.includes("gemini"))?.detail,
            "Databricks"
        );
        assert.strictEqual(
            (requestedQuery as {parent?: string}).parent,
            "schemas/system.ai"
        );
        assert.strictEqual(
            requestedPath,
            "/api/2.1/unity-catalog/model-services"
        );
        assert.strictEqual(sentWorkspaceId, "1234567890");
        provider.dispose();
        connection.dispose();
    });

    it("paginates model discovery", async () => {
        const pageTokens: Array<unknown> = [];
        const connection = new TestConnection("CONNECTED", async (options) => {
            pageTokens.push(options.query?.page_token);
            if (pageTokens.length === 1) {
                return {
                    model_services: [
                        {name: "model-services/system.ai.gpt-first"},
                    ],
                    next_page_token: "next",
                };
            }
            return {
                model_services: [{name: "model-services/system.ai.gpt-second"}],
            };
        });
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            undefined,
            discoverWith(connection)
        );

        const models = await provider.provideLanguageModelChatInformation(
            {silent: true},
            NEVER_CANCELLED_TOKEN
        );

        assert.deepStrictEqual(pageTokens, [undefined, "next"]);
        assert.deepStrictEqual(
            models.map((model) => model.id),
            ["system.ai.gpt-first", "system.ai.gpt-second"]
        );
        provider.dispose();
        connection.dispose();
    });

    it("posts chat completions through the connected API client", async () => {
        let requestedPath: string | undefined;
        let method: string | undefined;
        let sentWorkspaceId: string | null = null;
        let sentAuthorization: string | null = null;
        let sentContentType: string | null = null;
        let sentBody: unknown;
        const textDeltas: string[] = [];
        const connection = new TestConnection("CONNECTED", async (options) => {
            requestedPath = options.path;
            method = options.method;
            sentWorkspaceId = options.headers.get("X-Databricks-Org-Id");
            sentAuthorization = options.headers.get("Authorization");
            sentContentType = options.headers.get("Content-Type");
            sentBody = options.payload;
            return {
                choices: [
                    {
                        message: {
                            role: "assistant",
                            content: "ok",
                        },
                    },
                ],
            };
        });

        const response = await requestUnityGateway(
            connection,
            {
                model: "system.ai.gpt-test",
                messages: [{role: "user", content: "hi"}],
                maxTokens: 4_096,
                stream: true,
                tools: [
                    {
                        type: "function",
                        function: {
                            name: "read_file",
                            description: "Read a file",
                            parameters: {type: "object"},
                        },
                    },
                ],
                toolChoice: "auto",
            },
            NEVER_CANCELLED_TOKEN,
            (text) => textDeltas.push(text),
            connection.fetcher
        );

        assert.strictEqual(
            requestedPath,
            "/ai-gateway/mlflow/v1/chat/completions"
        );
        assert.strictEqual(method, "POST");
        assert.strictEqual(sentWorkspaceId, "1234567890");
        assert.strictEqual(sentAuthorization, "Bearer test-token");
        assert.strictEqual(sentContentType, "application/json");
        assert.deepStrictEqual(sentBody, {
            model: "system.ai.gpt-test",
            messages: [{role: "user", content: "hi"}],
            max_tokens: 4_096,
            stream: true,
            tools: [
                {
                    type: "function",
                    function: {
                        name: "read_file",
                        description: "Read a file",
                        parameters: {type: "object"},
                    },
                },
            ],
            tool_choice: "auto",
        });
        assert.deepStrictEqual(response.message, {
            role: "assistant",
            content: "ok",
        });
        assert.deepStrictEqual(textDeltas, ["ok"]);
        assert.strictEqual(response.textWasStreamed, true);
        connection.dispose();
    });

    it("streams text and reassembles tool-call deltas with opaque state", async () => {
        const connection = new TestConnection("CONNECTED");
        const chunk = (
            delta: Record<string, unknown>,
            finishReason: string | null = null
        ) => ({
            id: "chatcmpl-test",
            object: "chat.completion.chunk",
            created: 0,
            model: "system.ai.gemini-test",
            choices: [
                {
                    index: 0,
                    delta,
                    finish_reason: finishReason,
                },
            ],
        });
        const fetcher: typeof fetch = async () =>
            asSseResponse([
                chunk({
                    role: "assistant",
                    content: "Read",
                    reasoning_content: "reason-",
                    provider_state: {trace: "trace-1"},
                    tool_calls: [
                        {
                            index: 0,
                            id: "call-1",
                            type: "function",
                            thoughtSignature: "signature-1",
                            function: {
                                name: "read_file",
                                arguments: '{"path":',
                            },
                        },
                    ],
                }),
                chunk({
                    content: "ing",
                    reasoning_content: "continued",
                    tool_calls: [
                        {
                            index: 0,
                            function: {arguments: '"README.md"}'},
                        },
                    ],
                }),
                chunk({}, "tool_calls"),
            ]);
        const textDeltas: string[] = [];

        const response = await requestUnityGateway(
            connection,
            {
                model: "system.ai.gemini-test",
                messages: [{role: "user", content: "Read the file"}],
                stream: true,
            },
            NEVER_CANCELLED_TOKEN,
            (text) => textDeltas.push(text),
            fetcher
        );

        assert.deepStrictEqual(textDeltas, ["Read", "ing"]);
        assert.strictEqual(response.textWasStreamed, true);
        assert.deepStrictEqual(response.message, {
            role: "assistant",
            content: "Reading",
            reasoning_content: "reason-continued",
            provider_state: {trace: "trace-1"},
            tool_calls: [
                {
                    id: "call-1",
                    type: "function",
                    thoughtSignature: "signature-1",
                    function: {
                        name: "read_file",
                        arguments: '{"path":"README.md"}',
                    },
                },
            ],
        });
        connection.dispose();
    });

    it("preserves streamed content parts and reports their text", async () => {
        const connection = new TestConnection("CONNECTED");
        const content = [
            {
                type: "text",
                text: "Signed response",
                signature: "content-signature",
            },
        ];
        const fetcher: typeof fetch = async () =>
            asSseResponse([
                {
                    id: "chatcmpl-test",
                    object: "chat.completion.chunk",
                    created: 0,
                    model: "system.ai.gemini-test",
                    choices: [
                        {
                            index: 0,
                            delta: {role: "assistant", content},
                            finish_reason: "stop",
                        },
                    ],
                },
            ]);
        const textDeltas: string[] = [];

        const response = await requestUnityGateway(
            connection,
            {
                model: "system.ai.gemini-test",
                messages: [{role: "user", content: "Respond"}],
                stream: true,
            },
            NEVER_CANCELLED_TOKEN,
            (text) => textDeltas.push(text),
            fetcher
        );

        assert.deepStrictEqual(textDeltas, ["Signed response"]);
        assert.deepStrictEqual(response.message.content, content);
        connection.dispose();
    });

    it("parses SSE events split across byte boundaries", async () => {
        const connection = new TestConnection("CONNECTED");
        const chunk = JSON.stringify({
            choices: [
                {
                    index: 0,
                    delta: {role: "assistant", content: "héllo"},
                    finish_reason: "stop",
                },
            ],
        });
        const bytes = new TextEncoder().encode(
            `: keepalive\r\ndata:${chunk}\r\n\r\ndata: [DONE]\r\n\r\n`
        );
        const fetcher: typeof fetch = async () =>
            new Response(
                new ReadableStream<Uint8Array>({
                    start(controller) {
                        for (const byte of bytes) {
                            controller.enqueue(Uint8Array.of(byte));
                        }
                        controller.close();
                    },
                }),
                {
                    status: 200,
                    headers: {"Content-Type": "text/event-stream"},
                }
            );
        const textDeltas: string[] = [];

        const response = await requestUnityGateway(
            connection,
            {
                model: "system.ai.gpt-test",
                messages: [{role: "user", content: "Respond"}],
                stream: true,
            },
            NEVER_CANCELLED_TOKEN,
            (text) => textDeltas.push(text),
            fetcher
        );

        assert.deepStrictEqual(textDeltas, ["héllo"]);
        assert.strictEqual(response.message.content, "héllo");
        connection.dispose();
    });

    it("completes a stream on [DONE] even without finish_reason", async () => {
        const connection = new TestConnection("CONNECTED");
        const fetcher: typeof fetch = async () =>
            asSseResponse([
                {
                    choices: [
                        {
                            delta: {role: "assistant", content: "ok"},
                        },
                    ],
                },
            ]);

        const response = await requestUnityGateway(
            connection,
            {
                model: "system.ai.gpt-test",
                messages: [{role: "user", content: "Respond"}],
                stream: true,
            },
            NEVER_CANCELLED_TOKEN,
            undefined,
            fetcher
        );

        assert.strictEqual(response.message.content, "ok");
        connection.dispose();
    });

    it("surfaces errors sent inside an SSE response", async () => {
        const connection = new TestConnection("CONNECTED");
        const fetcher: typeof fetch = async () =>
            asSseResponse([{error: {message: "The routed provider failed"}}]);

        await assert.rejects(
            requestUnityGateway(
                connection,
                {
                    model: "system.ai.gpt-test",
                    messages: [{role: "user", content: "Respond"}],
                    stream: true,
                },
                NEVER_CANCELLED_TOKEN,
                undefined,
                fetcher
            ),
            /streaming error: The routed provider failed/
        );

        connection.dispose();
    });

    it("rejects a partial response when streaming is cancelled", async () => {
        const connection = new TestConnection("CONNECTED");
        const cancellationEmitter = new EventEmitter<void>();
        let cancellationRequested = false;
        const token: CancellationToken = {
            get isCancellationRequested() {
                return cancellationRequested;
            },
            onCancellationRequested: cancellationEmitter.event,
        };
        const fetcher: typeof fetch = async (_input, init) => {
            const body = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(
                        new TextEncoder().encode(
                            `data: ${JSON.stringify({
                                id: "chatcmpl-test",
                                object: "chat.completion.chunk",
                                created: 0,
                                model: "system.ai.test",
                                choices: [
                                    {
                                        index: 0,
                                        delta: {
                                            role: "assistant",
                                            content: "partial",
                                        },
                                        finish_reason: null,
                                    },
                                ],
                            })}\n\n`
                        )
                    );
                    init?.signal?.addEventListener(
                        "abort",
                        () =>
                            controller.error(
                                new DOMException(
                                    "The operation was aborted.",
                                    "AbortError"
                                )
                            ),
                        {once: true}
                    );
                },
            });
            return new Response(body, {
                status: 200,
                headers: {"Content-Type": "text/event-stream"},
            });
        };

        await assert.rejects(
            requestUnityGateway(
                connection,
                {
                    model: "system.ai.gpt-test",
                    messages: [{role: "user", content: "Respond"}],
                    stream: true,
                },
                token,
                () => {
                    cancellationRequested = true;
                    cancellationEmitter.fire();
                },
                fetcher
            ),
            /cancelled/
        );

        cancellationEmitter.dispose();
        connection.dispose();
    });

    it("omits reasoning_effort when the request has no tools", async () => {
        let sentBody: unknown;
        const connection = new TestConnection("CONNECTED", async (options) => {
            sentBody = options.payload;
            return {
                choices: [
                    {
                        message: {
                            role: "assistant",
                            content: "ok",
                        },
                    },
                ],
            };
        });

        await requestUnityGateway(
            connection,
            {
                model: "system.ai.gpt-test",
                messages: [{role: "user", content: "hi"}],
                stream: true,
            },
            NEVER_CANCELLED_TOKEN,
            undefined,
            connection.fetcher
        );

        assert.deepStrictEqual(sentBody, {
            model: "system.ai.gpt-test",
            messages: [{role: "user", content: "hi"}],
            stream: true,
        });
        connection.dispose();
    });

    it("retries and caches models that require disabled reasoning with tools", async () => {
        const sentBodies: Array<Record<string, unknown>> = [];
        const connection = new TestConnection("CONNECTED");
        const fetcher: typeof fetch = async (_input, init) => {
            sentBodies.push(JSON.parse(String(init?.body)));
            if (sentBodies.length === 1) {
                return new Response(
                    JSON.stringify({
                        error_code: "BAD_REQUEST",
                        message:
                            "Function tools with reasoning_effort are not supported; " +
                            "set reasoning_effort to 'none'",
                    }),
                    {status: 400}
                );
            }
            return asStreamingResponse({
                choices: [
                    {
                        message: {
                            role: "assistant",
                            content: "ok",
                        },
                    },
                ],
            });
        };
        const payload = {
            model: "system.ai.requires-disabled-reasoning",
            messages: [{role: "user" as const, content: "hi"}],
            stream: true as const,
            tools: [
                {
                    type: "function" as const,
                    function: {
                        name: "read_file",
                        description: "Read a file",
                        parameters: {type: "object"},
                    },
                },
            ],
        };

        await requestUnityGateway(
            connection,
            payload,
            NEVER_CANCELLED_TOKEN,
            undefined,
            fetcher
        );
        await requestUnityGateway(
            connection,
            payload,
            NEVER_CANCELLED_TOKEN,
            undefined,
            fetcher
        );

        assert.strictEqual(sentBodies.length, 3);
        assert.strictEqual(sentBodies[0].reasoning_effort, undefined);
        assert.strictEqual(sentBodies[1].reasoning_effort, "none");
        assert.strictEqual(sentBodies[2].reasoning_effort, "none");
        connection.dispose();
    });

    it("returns text from the Unity Gateway request", async () => {
        const connection = new TestConnection("CONNECTED");
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            async (requestConnection, payload) => {
                assert.strictEqual(requestConnection, connection);
                assert.deepStrictEqual(payload, {
                    model: "system.ai.gpt-5-6-sol",
                    messages: [],
                    maxTokens: 4_096,
                    stream: true,
                });
                return {
                    message: {
                        role: "assistant",
                        content: [
                            {
                                type: "text",
                                text: "Gateway response",
                                signature: "opaque",
                            },
                        ],
                    },
                };
            }
        );
        const parts: LanguageModelResponsePart[] = [];

        await provider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [],
            {},
            {report: (part) => parts.push(part)},
            NEVER_CANCELLED_TOKEN
        );

        const text = parts.find((part) => "value" in part);
        assert.ok(text);
        assert.strictEqual(text.value, "Gateway response");
        provider.dispose();
        connection.dispose();
    });

    it("reports streamed text without reporting the final text twice", async () => {
        const connection = new TestConnection("CONNECTED");
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            async (_connection, _payload, _token, onTextDelta) => {
                onTextDelta?.("Gateway ");
                onTextDelta?.("response");
                return {
                    message: {
                        role: "assistant",
                        content: "Gateway response",
                    },
                    textWasStreamed: true,
                };
            }
        );
        const parts: LanguageModelResponsePart[] = [];

        await provider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [],
            {},
            {report: (part) => parts.push(part)},
            NEVER_CANCELLED_TOKEN
        );

        assert.deepStrictEqual(
            parts.map((part) => ("value" in part ? part.value : undefined)),
            ["Gateway ", "response"]
        );
        provider.dispose();
        connection.dispose();
    });

    it("sanitizes tool schemas and reports tool calls", async () => {
        const connection = new TestConnection("CONNECTED");
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            async (_connection, payload) => {
                assert.deepStrictEqual(payload.messages, [
                    {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                            {
                                id: "previous-call",
                                type: "function",
                                function: {
                                    name: "read_file",
                                    arguments: '{"path":"README.md"}',
                                },
                            },
                        ],
                    },
                    {
                        role: "tool",
                        tool_call_id: "previous-call",
                        content: "contents",
                    },
                ]);
                assert.deepStrictEqual(payload.tools, [
                    {
                        type: "function",
                        function: {
                            name: "run_in_terminal",
                            description: "Run a command",
                            parameters: {
                                type: "object",
                                properties: {
                                    command: {
                                        type: "string",
                                        nullable: true,
                                    },
                                    timeout: {
                                        type: "number",
                                        minimum: 1,
                                        maximum: 10,
                                    },
                                    retries: {
                                        type: "integer",
                                        minimum: 1,
                                        maximum: 2,
                                    },
                                },
                            },
                        },
                    },
                ]);
                assert.strictEqual(payload.toolChoice, "auto");
                return {
                    message: {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                            {
                                id: "next-call",
                                type: "function",
                                function: {
                                    name: "run_in_terminal",
                                    arguments: '{"command":"pwd"}',
                                },
                            },
                        ],
                    },
                };
            }
        );
        const parts: LanguageModelResponsePart[] = [];

        await provider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [
                {
                    role: 2,
                    content: [
                        {
                            callId: "previous-call",
                            name: "read_file",
                            input: {path: "README.md"},
                        } satisfies LanguageModelToolCallPart,
                    ],
                },
                {
                    role: 1,
                    content: [
                        {
                            callId: "previous-call",
                            content: [{value: "contents"}],
                        } satisfies LanguageModelToolResultPart,
                    ],
                },
            ],
            {
                tools: [
                    {
                        name: "run_in_terminal",
                        description: "Run a command",
                        inputSchema: {
                            $schema:
                                "https://json-schema.org/draft/2020-12/schema",
                            type: "object",
                            properties: {
                                command: {
                                    type: ["string", "null"],
                                    $comment: "Shell command",
                                    enumDescriptions: ["A command"],
                                },
                                timeout: {
                                    type: "number",
                                    exclusiveMinimum: 1,
                                    exclusiveMaximum: 10,
                                },
                                retries: {
                                    type: "integer",
                                    exclusiveMinimum: 0,
                                    exclusiveMaximum: 3,
                                },
                            },
                            propertyNames: {pattern: "^[a-z]+$"},
                        },
                    },
                ],
            },
            {report: (part) => parts.push(part)},
            NEVER_CANCELLED_TOKEN
        );

        const toolCall = parts.find(
            (part): part is LanguageModelToolCallPart => "callId" in part
        );
        assert.ok(toolCall);
        assert.strictEqual(toolCall.callId, "next-call");
        assert.strictEqual(toolCall.name, "run_in_terminal");
        assert.deepStrictEqual(toolCall.input, {command: "pwd"});
        provider.dispose();
        connection.dispose();
    });

    it("reports parallel tool calls", async () => {
        const connection = new TestConnection("CONNECTED");
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            async () => ({
                message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                        {
                            id: "call-1",
                            type: "function",
                            function: {name: "first", arguments: "{}"},
                        },
                        {
                            id: "call-2",
                            type: "function",
                            function: {name: "second", arguments: "{}"},
                        },
                    ],
                },
            })
        );
        const parts: LanguageModelResponsePart[] = [];

        await provider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [],
            {},
            {report: (part) => parts.push(part)},
            NEVER_CANCELLED_TOKEN
        );

        const toolCalls = parts.filter(
            (part): part is LanguageModelToolCallPart => "callId" in part
        );
        assert.deepStrictEqual(
            toolCalls.map((part) => [part.callId, part.name, part.input]),
            [
                ["call-1", "first", {}],
                ["call-2", "second", {}],
            ]
        );

        provider.dispose();
        connection.dispose();
    });

    it("does not forward tools for a text-only model", async () => {
        const connection = new TestConnection("CONNECTED");
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            async (_connection, payload) => {
                assert.strictEqual(payload.tools, undefined);
                assert.strictEqual(payload.toolChoice, undefined);
                return {
                    message: {role: "assistant", content: "text response"},
                };
            }
        );

        await provider.provideLanguageModelChatResponse(
            {
                ...UNITY_GATEWAY_LANGUAGE_MODEL,
                capabilities: {imageInput: false},
            },
            [],
            {
                tools: [{name: "read_file"}],
            },
            {report: () => undefined},
            NEVER_CANCELLED_TOKEN
        );

        provider.dispose();
        connection.dispose();
    });

    it("reconstructs multiple tool calls and non-empty results", async () => {
        const connection = new TestConnection("CONNECTED");
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            async (_connection, payload) => {
                assert.deepStrictEqual(payload.messages, [
                    {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                            {
                                id: "call-1",
                                type: "function",
                                function: {
                                    name: "read_file",
                                    arguments: '{"path":"README.md"}',
                                },
                            },
                            {
                                id: "call-2",
                                type: "function",
                                function: {
                                    name: "list_files",
                                    arguments: '{"path":"src"}',
                                },
                            },
                        ],
                    },
                    {
                        role: "tool",
                        tool_call_id: "call-1",
                        content: "(no output)",
                    },
                    {
                        role: "tool",
                        tool_call_id: "call-2",
                        content: "file list",
                    },
                ]);
                return {
                    message: {
                        role: "assistant",
                        content: "Done",
                    },
                };
            }
        );

        await provider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [
                {
                    role: 2,
                    content: [
                        {value: ""},
                        {
                            callId: "call-1",
                            name: "read_file",
                            input: {path: "README.md"},
                        } satisfies LanguageModelToolCallPart,
                        {
                            callId: "call-2",
                            name: "list_files",
                            input: {path: "src"},
                        } satisfies LanguageModelToolCallPart,
                    ],
                },
                {
                    role: 1,
                    content: [
                        {
                            callId: "call-1",
                            content: [],
                        } satisfies LanguageModelToolResultPart,
                        {
                            callId: "call-2",
                            content: [{value: "file list"}],
                        } satisfies LanguageModelToolResultPart,
                    ],
                },
            ],
            {},
            {report: () => undefined},
            NEVER_CANCELLED_TOKEN
        );

        provider.dispose();
        connection.dispose();
    });

    it("round-trips opaque tool-call state through a data part", async () => {
        const connection = new TestConnection("CONNECTED");
        let requestCount = 0;
        const request = async (
            _connection: unknown,
            payload: {readonly messages: readonly unknown[]}
        ) => {
            requestCount++;
            if (requestCount === 1) {
                assert.deepStrictEqual(payload.messages, []);
                return {
                    message: {
                        role: "assistant" as const,
                        content: null,
                        tool_calls: [
                            {
                                id: "call-1",
                                type: "function" as const,
                                thoughtSignature: "signature",
                                function: {
                                    name: "read_file",
                                    arguments: '{"path":"README.md"}',
                                },
                            },
                        ],
                    },
                };
            }
            assert.deepStrictEqual(payload.messages, [
                {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                        {
                            id: "call-1",
                            type: "function",
                            thoughtSignature: "signature",
                            function: {
                                name: "read_file",
                                arguments: '{"path":"README.md"}',
                            },
                        },
                    ],
                },
                {
                    role: "tool",
                    tool_call_id: "call-1",
                    content: "file contents",
                },
            ]);
            return {
                message: {
                    role: "assistant" as const,
                    content: "Done",
                },
            };
        };
        const firstProvider = new DatabricksLanguageModelChatProvider(
            connection,
            async (_connection, payload) => {
                return request(_connection, payload);
            }
        );
        const firstParts: LanguageModelResponsePart[] = [];

        await firstProvider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [],
            {},
            {report: (part) => firstParts.push(part)},
            NEVER_CANCELLED_TOKEN
        );
        assert.strictEqual(firstParts.length, 2);
        const firstToolCall = firstParts.find(
            (part): part is LanguageModelToolCallPart => "callId" in part
        );
        assert.ok(firstToolCall);
        assert.strictEqual(firstToolCall.callId, "call-1");
        assert.strictEqual(firstToolCall.name, "read_file");
        assert.deepStrictEqual(firstToolCall.input, {path: "README.md"});

        firstProvider.dispose();
        const secondProvider = new DatabricksLanguageModelChatProvider(
            connection,
            async (_connection, payload) => {
                return request(_connection, payload);
            }
        );
        const secondParts: LanguageModelResponsePart[] = [];
        await secondProvider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [
                {
                    role: 2,
                    content: firstParts,
                },
                {
                    role: 1,
                    content: [
                        {
                            callId: "call-1",
                            content: [{value: "file contents"}],
                        } satisfies LanguageModelToolResultPart,
                    ],
                },
            ],
            {},
            {report: (part) => secondParts.push(part)},
            NEVER_CANCELLED_TOKEN
        );

        assert.strictEqual(requestCount, 2);
        assert.strictEqual(secondParts.length, 1);
        assert.ok("value" in secondParts[0]);
        assert.strictEqual(secondParts[0].value, "Done");
        secondProvider.dispose();
        connection.dispose();
    });

    it("omits provider-specific reasoning when replaying assistant state", async () => {
        const connection = new TestConnection("CONNECTED");
        let requestCount = 0;
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            async (_connection, payload) => {
                requestCount++;
                if (requestCount === 1) {
                    return {
                        message: {
                            role: "assistant" as const,
                            content: [
                                {
                                    type: "thinking",
                                    thinking: "Internal reasoning",
                                    signature: "thinking-signature",
                                },
                                {
                                    type: "reasoning",
                                    summary: [
                                        {
                                            type: "summary_text",
                                            text: "",
                                            signature: "reasoning-signature",
                                        },
                                    ],
                                },
                                {type: "text", text: "Checking"},
                            ],
                            reasoning_content: "Internal reasoning",
                            provider_state: {opaque: "message-level state"},
                            tool_calls: [
                                {
                                    id: "call-1",
                                    type: "function" as const,
                                    function: {
                                        name: "read_file",
                                        arguments: '{"path":"README.md"}',
                                    },
                                },
                            ],
                        },
                    };
                }
                assert.deepStrictEqual(payload.messages, [
                    {
                        role: "assistant",
                        content: "Checking",
                        tool_calls: [
                            {
                                id: "call-1",
                                type: "function",
                                function: {
                                    name: "read_file",
                                    arguments: '{"path":"README.md"}',
                                },
                            },
                        ],
                    },
                    {
                        role: "tool",
                        tool_call_id: "call-1",
                        content: "contents",
                    },
                ]);
                return {
                    message: {
                        role: "assistant" as const,
                        content: "Done",
                    },
                };
            }
        );
        const firstParts: LanguageModelResponsePart[] = [];

        await provider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [],
            {},
            {report: (part) => firstParts.push(part)},
            NEVER_CANCELLED_TOKEN
        );
        await provider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [
                {role: 2, content: firstParts},
                {
                    role: 1,
                    content: [
                        {
                            callId: "call-1",
                            content: [{value: "contents"}],
                        } satisfies LanguageModelToolResultPart,
                    ],
                },
            ],
            {},
            {report: () => undefined},
            NEVER_CANCELLED_TOKEN
        );

        assert.strictEqual(requestCount, 2);
        provider.dispose();
        connection.dispose();
    });

    it("rehydrates extra tool-call fields when Copilot drops the data part", async () => {
        const connection = new TestConnection("CONNECTED");
        let requestCount = 0;
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            async (_connection, payload) => {
                requestCount++;
                if (requestCount === 1) {
                    return {
                        message: {
                            role: "assistant" as const,
                            content: null,
                            tool_calls: [
                                {
                                    id: "read_file",
                                    type: "function" as const,
                                    thoughtSignature: "opaque-signature",
                                    function: {
                                        name: "read_file",
                                        arguments:
                                            '{"endLine":100,"filePath":"test.py","startLine":1}',
                                    },
                                },
                            ],
                        },
                    };
                }
                assert.deepStrictEqual(payload.messages, [
                    {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                            {
                                id: "read_file__vscode-0",
                                type: "function",
                                thoughtSignature: "opaque-signature",
                                function: {
                                    name: "read_file",
                                    arguments:
                                        '{"filePath":"test.py","startLine":1,"endLine":100}',
                                },
                            },
                        ],
                    },
                    {
                        role: "tool",
                        tool_call_id: "read_file__vscode-0",
                        content: "file contents",
                    },
                ]);
                return {
                    message: {
                        role: "assistant" as const,
                        content: "Done",
                    },
                };
            }
        );
        const firstParts: LanguageModelResponsePart[] = [];

        await provider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [],
            {},
            {report: (part) => firstParts.push(part)},
            NEVER_CANCELLED_TOKEN
        );

        const firstToolCall = firstParts.find(
            (part): part is LanguageModelToolCallPart => "callId" in part
        );
        assert.ok(firstToolCall);

        await provider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [
                {
                    role: 2,
                    content: [
                        {
                            callId: "read_file__vscode-0",
                            name: "read_file",
                            input: {
                                filePath: "test.py",
                                startLine: 1,
                                endLine: 100,
                            },
                        } satisfies LanguageModelToolCallPart,
                    ],
                },
                {
                    role: 1,
                    content: [
                        {
                            callId: "read_file__vscode-0",
                            content: [{value: "file contents"}],
                        } satisfies LanguageModelToolResultPart,
                    ],
                },
            ],
            {},
            {report: () => undefined},
            NEVER_CANCELLED_TOKEN
        );

        assert.strictEqual(requestCount, 2);
        provider.dispose();
        connection.dispose();
    });

    it("preserves signatures for earlier tool calls across later turns", async () => {
        const connection = new TestConnection("CONNECTED");
        let requestCount = 0;
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            async (
                _connection,
                payload: {readonly messages: readonly unknown[]}
            ) => {
                requestCount++;
                if (requestCount === 1) {
                    return {
                        message: {
                            role: "assistant" as const,
                            content: null,
                            tool_calls: [
                                {
                                    id: "read_file",
                                    type: "function" as const,
                                    thoughtSignature: "sig-a",
                                    function: {
                                        name: "read_file",
                                        arguments: '{"filePath":"a.py"}',
                                    },
                                },
                            ],
                        },
                    };
                }
                if (requestCount === 2) {
                    return {
                        message: {
                            role: "assistant" as const,
                            content: null,
                            tool_calls: [
                                {
                                    id: "list_dir",
                                    type: "function" as const,
                                    thoughtSignature: "sig-b",
                                    function: {
                                        name: "list_dir",
                                        arguments: '{"path":"."}',
                                    },
                                },
                            ],
                        },
                    };
                }
                // Third turn replays the whole history. Both earlier assistant
                // tool calls must still carry their original signatures.
                assert.deepStrictEqual(payload.messages, [
                    {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                            {
                                id: "read_file__vscode-0",
                                type: "function",
                                thoughtSignature: "sig-a",
                                function: {
                                    name: "read_file",
                                    arguments: '{"filePath":"a.py"}',
                                },
                            },
                        ],
                    },
                    {
                        role: "tool",
                        tool_call_id: "read_file__vscode-0",
                        content: "contents a",
                    },
                    {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                            {
                                id: "list_dir__vscode-1",
                                type: "function",
                                thoughtSignature: "sig-b",
                                function: {
                                    name: "list_dir",
                                    arguments: '{"path":"."}',
                                },
                            },
                        ],
                    },
                    {
                        role: "tool",
                        tool_call_id: "list_dir__vscode-1",
                        content: "contents b",
                    },
                ]);
                return {
                    message: {role: "assistant" as const, content: "Done"},
                };
            }
        );

        await provider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [],
            {},
            {report: () => undefined},
            NEVER_CANCELLED_TOKEN
        );
        await provider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [
                {
                    role: 2,
                    content: [
                        {
                            callId: "read_file__vscode-0",
                            name: "read_file",
                            input: {filePath: "a.py"},
                        } satisfies LanguageModelToolCallPart,
                    ],
                },
                {
                    role: 1,
                    content: [
                        {
                            callId: "read_file__vscode-0",
                            content: [{value: "contents a"}],
                        } satisfies LanguageModelToolResultPart,
                    ],
                },
            ],
            {},
            {report: () => undefined},
            NEVER_CANCELLED_TOKEN
        );
        await provider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [
                {
                    role: 2,
                    content: [
                        {
                            callId: "read_file__vscode-0",
                            name: "read_file",
                            input: {filePath: "a.py"},
                        } satisfies LanguageModelToolCallPart,
                    ],
                },
                {
                    role: 1,
                    content: [
                        {
                            callId: "read_file__vscode-0",
                            content: [{value: "contents a"}],
                        } satisfies LanguageModelToolResultPart,
                    ],
                },
                {
                    role: 2,
                    content: [
                        {
                            callId: "list_dir__vscode-1",
                            name: "list_dir",
                            input: {path: "."},
                        } satisfies LanguageModelToolCallPart,
                    ],
                },
                {
                    role: 1,
                    content: [
                        {
                            callId: "list_dir__vscode-1",
                            content: [{value: "contents b"}],
                        } satisfies LanguageModelToolResultPart,
                    ],
                },
            ],
            {},
            {report: () => undefined},
            NEVER_CANCELLED_TOKEN
        );

        assert.strictEqual(requestCount, 3);
        provider.dispose();
        connection.dispose();
    });

    it("forwards the full Copilot tool list and schemas", async () => {
        const connection = new TestConnection("CONNECTED");
        const propertyNames = Array.from(
            {length: 17},
            (_, index) => `property${index}`
        );
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            async (_connection, payload) => {
                assert.strictEqual(payload.tools?.length, 33);
                const parameters = payload.tools?.[0].function.parameters;
                assert.strictEqual(
                    Object.keys(
                        parameters?.["properties"] as Record<string, unknown>
                    ).length,
                    17
                );
                assert.deepStrictEqual(parameters?.["required"], propertyNames);
                return {
                    message: {
                        role: "assistant",
                        content: "Done",
                    },
                };
            }
        );

        await provider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [],
            {
                tools: Array.from({length: 33}, (_, toolIndex) => ({
                    name: `tool${toolIndex}`,
                    inputSchema: {
                        type: "object",
                        properties: Object.fromEntries(
                            propertyNames.map((name) => [
                                name,
                                {type: "string", pattern: ".*"},
                            ])
                        ),
                        required: propertyNames,
                    },
                })),
            },
            {report: () => undefined},
            NEVER_CANCELLED_TOKEN
        );

        provider.dispose();
        connection.dispose();
    });

    it("reports sign-in guidance after logout", async () => {
        const connection = new TestConnection("DISCONNECTED");
        const provider = new DatabricksLanguageModelChatProvider(connection);
        const parts: LanguageModelResponsePart[] = [];

        await provider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [],
            {},
            {report: (part) => parts.push(part)},
            NEVER_CANCELLED_TOKEN
        );
        assert.strictEqual(
            (parts[0] as {value?: string}).value,
            "Sign in to Databricks to use this model."
        );

        provider.dispose();
        connection.dispose();
    });

    it("reports gateway permission failures without throwing", async () => {
        const connection = new TestConnection("CONNECTED");
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            async () => {
                throw Object.assign(new Error("Forbidden"), {status: 403});
            }
        );
        const parts: LanguageModelResponsePart[] = [];

        await provider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [],
            {},
            {report: (part) => parts.push(part)},
            NEVER_CANCELLED_TOKEN
        );
        assert.strictEqual(
            (parts[0] as {value?: string}).value,
            "You do not have access to this model."
        );

        provider.dispose();
        connection.dispose();
    });

    it("reports unsupported requests without gateway details", async () => {
        const connection = new TestConnection("CONNECTED");
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            async () => {
                throw Object.assign(new Error("Databricks returned HTTP 400"), {
                    status: 400,
                    body: JSON.stringify({
                        error: {
                            message: "Unsupported tool combination",
                        },
                    }),
                });
            }
        );
        const parts: LanguageModelResponsePart[] = [];

        await provider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [],
            {},
            {report: (part) => parts.push(part)},
            NEVER_CANCELLED_TOKEN
        );
        assert.strictEqual(
            (parts[0] as {value?: string}).value,
            "This model could not complete the request. Try another Databricks model."
        );

        provider.dispose();
        connection.dispose();
    });

    it("reports models that reject disabled reasoning as text without throwing", async () => {
        const connection = new TestConnection("CONNECTED");
        const body = JSON.stringify({
            error: {
                message: "The requested option is unavailable.",
                type: "invalid_request_error",
                param: "reasoning_effort",
                code: "unsupported_value",
            },
        });
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            async () => {
                throw Object.assign(new Error("Databricks returned HTTP 400"), {
                    status: 400,
                    body,
                });
            }
        );

        const parts: LanguageModelResponsePart[] = [];
        await provider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [],
            {},
            {report: (part) => parts.push(part)},
            NEVER_CANCELLED_TOKEN
        );

        assert.strictEqual(parts.length, 1);
        assert.strictEqual(
            (parts[0] as {value?: string}).value,
            "This model cannot use the tools required by Chat. Choose another Databricks model."
        );

        provider.dispose();
        connection.dispose();
    });

    it("reports models that only support responses api as text without throwing", async () => {
        const connection = new TestConnection("CONNECTED");
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            async () => {
                throw Object.assign(new Error("Databricks returned HTTP 400"), {
                    status: 400,
                    body: "This endpoint only supports the Responses API.",
                });
            }
        );

        const parts: LanguageModelResponsePart[] = [];
        await provider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [],
            {},
            {report: (part) => parts.push(part)},
            NEVER_CANCELLED_TOKEN
        );

        assert.strictEqual(parts.length, 1);
        assert.strictEqual(
            (parts[0] as {value?: string}).value,
            "This model is not supported in Databricks Chat yet. Choose another Databricks model."
        );

        provider.dispose();
        connection.dispose();
    });

    it("reports a missing model without throwing", async () => {
        const connection = new TestConnection("CONNECTED");
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            async () => {
                throw Object.assign(new Error("Not found"), {status: 404});
            }
        );
        const parts: LanguageModelResponsePart[] = [];

        await provider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [],
            {},
            {report: (part) => parts.push(part)},
            NEVER_CANCELLED_TOKEN
        );
        assert.strictEqual(
            (parts[0] as {value?: string}).value,
            "This model is no longer available. Choose another Databricks model."
        );

        provider.dispose();
        connection.dispose();
    });

    it("reports rate limits without throwing", async () => {
        const connection = new TestConnection("CONNECTED");
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            async () => {
                throw Object.assign(new Error("Too many requests"), {
                    status: 429,
                });
            }
        );
        const parts: LanguageModelResponsePart[] = [];

        await provider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [],
            {},
            {report: (part) => parts.push(part)},
            NEVER_CANCELLED_TOKEN
        );
        assert.strictEqual(
            (parts[0] as {value?: string}).value,
            "Databricks rate-limited this request. Try again in a moment."
        );

        provider.dispose();
        connection.dispose();
    });

    it("reports server failures without backend details", async () => {
        const connection = new TestConnection("CONNECTED");
        const provider = new DatabricksLanguageModelChatProvider(
            connection,
            async () => {
                throw Object.assign(new Error("internal backend details"), {
                    status: 503,
                });
            }
        );
        const parts: LanguageModelResponsePart[] = [];

        await provider.provideLanguageModelChatResponse(
            UNITY_GATEWAY_LANGUAGE_MODEL,
            [],
            {},
            {report: (part) => parts.push(part)},
            NEVER_CANCELLED_TOKEN
        );
        assert.strictEqual(
            (parts[0] as {value?: string}).value,
            "Databricks is temporarily unavailable. Try again later."
        );

        provider.dispose();
        connection.dispose();
    });

    it("estimates tokens from text length", async () => {
        const connection = new TestConnection("CONNECTED");
        const provider = new DatabricksLanguageModelChatProvider(connection);

        assert.strictEqual(
            await provider.provideTokenCount(
                UNITY_GATEWAY_LANGUAGE_MODEL,
                "12345",
                NEVER_CANCELLED_TOKEN
            ),
            2
        );

        provider.dispose();
        connection.dispose();
    });
});
