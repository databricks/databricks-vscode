/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {
    CancellationError,
    CancellationTokenSource,
    Disposable,
    EventEmitter,
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
    LanguageModelChatProvider,
    LanguageModelChatRequestMessage,
    LanguageModelResponsePart,
} from "vscode";
import {ApiClient, Config, logging} from "@databricks/sdk-experimental";
import {AiGatewayClient} from "@databricks/sdk-aigateway/v1";
import type {HttpRequest, HttpResponse} from "@databricks/sdk-core/http";
import {anything, instance, mock, when} from "ts-mockito";
import {v2ClientOptions} from "../configuration/sdkV2Bridge";
import {
    UnityGatewayChatProvider,
    registerUnityGatewayChatProvider,
} from "./UnityGatewayChatProvider";
import {UnityGatewayConnectionManager} from "./UnityGatewayConnectionManager";
import {UnityGatewayResponsesClient} from "./UnityGatewayResponsesClient";

describe(__filename, () => {
    let mockConnectionManager: UnityGatewayConnectionManager;
    let onDidChangeConnection: EventEmitter<void>;
    let requestCount: number;
    let statusCode: number;
    let responseGate: Promise<void>;
    let onSend: (() => void) | undefined;
    let respond: (() => Promise<HttpResponse>) | undefined;

    function newClient(
        config: Config = instance(mock(Config))
    ): AiGatewayClient {
        return new AiGatewayClient({
            ...v2ClientOptions(
                new ApiClient(config),
                new URL("https://ws.cloud.databricks.com")
            ),
            httpClient: {
                send: async (): Promise<HttpResponse> => {
                    requestCount++;
                    onSend?.();
                    await responseGate;
                    if (respond !== undefined) {
                        return respond();
                    }
                    return {
                        statusCode,
                        headers: new Headers({
                            "content-type": "application/json",
                        }),
                        body: new Response(
                            JSON.stringify(
                                statusCode === 200
                                    ? {
                                          model_services: [
                                              {
                                                  name: "system.ai.gpt-5",
                                                  supported_api_types: [
                                                      "mlflow/v1/responses",
                                                  ],
                                              },
                                          ],
                                      }
                                    : {error_code: "INTERNAL_ERROR"}
                            )
                        ).body,
                    };
                },
            },
        });
    }

    let chatRequests: HttpRequest[];
    let respondToChat: (request: HttpRequest) => Promise<HttpResponse>;

    function newResponsesClient(
        config: Config = instance(mock(Config))
    ): UnityGatewayResponsesClient {
        return new UnityGatewayResponsesClient({
            ...v2ClientOptions(
                new ApiClient(config),
                new URL("https://ws.cloud.databricks.com")
            ),
            httpClient: {
                send: async (request) => {
                    chatRequests.push(request);
                    return respondToChat(request);
                },
            },
        });
    }

    function sseResponse(...events: unknown[]): HttpResponse {
        return {
            statusCode: 200,
            headers: new Headers({"content-type": "text/event-stream"}),
            body: new Response(
                events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")
            ).body,
        };
    }

    function htmlResponse(statusCode: number): HttpResponse {
        return {
            statusCode,
            headers: new Headers({"content-type": "text/html"}),
            body: new Response("<html>Bad Gateway</html>").body,
        };
    }

    beforeEach(() => {
        mockConnectionManager = mock(UnityGatewayConnectionManager);
        onDidChangeConnection = new EventEmitter();
        when(mockConnectionManager.onDidChange).thenReturn(
            onDidChangeConnection.event
        );
        when(mockConnectionManager.aiGatewayClient).thenReturn(undefined);
        when(mockConnectionManager.responsesClient).thenReturn(undefined);
        chatRequests = [];
        respondToChat = async () =>
            sseResponse(
                {type: "response.output_text.delta", delta: "Hello"},
                {type: "response.completed", response: {}}
            );
        requestCount = 0;
        statusCode = 200;
        responseGate = Promise.resolve();
        onSend = undefined;
        respond = undefined;
    });

    function connect(client = newClient()) {
        when(mockConnectionManager.aiGatewayClient).thenReturn(client);
    }

    /** Holds responses until `release()`; `sent` resolves once a request is sent. */
    function holdResponses() {
        let release!: () => void;
        responseGate = new Promise((resolve) => (release = resolve));
        const sent = new Promise<void>((resolve) => (onSend = resolve));
        return {sent, release};
    }

    /** Runs `run` and returns the arguments of each error it logged. */
    async function loggedErrors(
        run: () => Promise<unknown>
    ): Promise<unknown[][]> {
        // getOrCreate returns a new logger each time, and ts-mockito can't
        // spy on the class, so intercept the method itself.
        const errors: unknown[][] = [];
        const {error} = logging.NamedLogger.prototype;
        logging.NamedLogger.prototype.error = (...args: unknown[]) => {
            errors.push(args);
        };
        try {
            await run();
        } finally {
            logging.NamedLogger.prototype.error = error;
        }
        return errors;
    }

    afterEach(() => {
        onDidChangeConnection.dispose();
    });

    describe("UnityGatewayChatProvider", () => {
        let provider: UnityGatewayChatProvider;
        let relists: number;

        function listModels() {
            return provider.provideLanguageModelChatInformation(
                {silent: true},
                new CancellationTokenSource().token
            );
        }

        beforeEach(() => {
            relists = 0;
            provider = new UnityGatewayChatProvider(
                instance(mockConnectionManager),
                async () => {
                    relists++;
                    return [];
                }
            );
        });

        afterEach(() => {
            provider.dispose();
        });

        it("lists no models while disconnected", async () => {
            assert.deepStrictEqual(await listModels(), []);
            assert.equal(requestCount, 0);
        });

        it("lists models once per connection", async () => {
            connect();

            const models = await listModels();
            assert.deepStrictEqual(
                models.map((model) => model.id),
                ["system.ai.gpt-5"]
            );
            assert.deepStrictEqual(await listModels(), models);
            assert.equal(requestCount, 1);

            connect();
            await listModels();
            assert.equal(requestCount, 2);
        });

        it("shares one listing between concurrent lookups", async () => {
            connect();
            const held = holdResponses();

            const lookups = Promise.all([listModels(), listModels()]);
            await held.sent;
            held.release();
            const [first, second] = await lookups;

            assert.equal(first.length, 1);
            assert.deepStrictEqual(second, first);
            assert.equal(requestCount, 1);
        });

        it("lists no models from a connection that changed while listing", async () => {
            connect();
            const held = holdResponses();

            const lookup = listModels();
            await held.sent;
            connect();
            held.release();

            assert.deepStrictEqual(await lookup, []);
        });

        it("lists no models once unregistered", async () => {
            connect();
            provider.dispose();

            assert.deepStrictEqual(await listModels(), []);
            assert.equal(requestCount, 0);
        });

        it("drops its listing when the connection goes", async () => {
            const client = newClient();
            connect(client);
            await listModels();

            when(mockConnectionManager.aiGatewayClient).thenReturn(undefined);
            onDidChangeConnection.fire();
            connect(client);
            await listModels();

            assert.equal(requestCount, 2);
        });

        it("lists no models once unregistered while listing", async () => {
            connect();
            const held = holdResponses();

            const lookup = listModels();
            await held.sent;
            provider.dispose();
            held.release();

            assert.deepStrictEqual(await lookup, []);
        });

        it("lists no models when listing fails, and retries next time", async () => {
            connect();
            statusCode = 500;

            assert.deepStrictEqual(await listModels(), []);

            statusCode = 200;
            assert.equal((await listModels()).length, 1);
            assert.equal(requestCount, 2);
        });

        it("logs the error when listing fails", async () => {
            const failure = new Error("connect ECONNREFUSED");
            connect();
            respond = async () => {
                throw failure;
            };

            const errors = await loggedErrors(listModels);

            assert.deepStrictEqual(errors, [
                ["Can't list Unity Gateway models", failure],
            ]);
        });

        it("asks VS Code to list again when the connection changes", () => {
            let changes = 0;
            provider.onDidChangeLanguageModelChatInformation(() => changes++);

            onDidChangeConnection.fire();

            assert.equal(changes, 1);
            assert.equal(relists, 1);
        });

        describe("chat", () => {
            const model: LanguageModelChatInformation = {
                id: "system.ai.gpt-5",
                name: "gpt-5",
                family: "gpt-5",
                version: "1",
                maxInputTokens: 128_000,
                maxOutputTokens: 4_096,
                capabilities: {toolCalling: true},
            };

            /** Chats and returns the reported parts. */
            async function chat(
                messages: LanguageModelChatRequestMessage[] = [
                    LanguageModelChatMessage.User("Hi"),
                ],
                token: CancellationToken = new CancellationTokenSource().token,
                onPart?: () => void
            ): Promise<LanguageModelResponsePart[]> {
                const parts: LanguageModelResponsePart[] = [];
                await provider.provideLanguageModelChatResponse(
                    model,
                    messages,
                    {
                        tools: [{name: "read_file", description: "Reads."}],
                        toolMode: LanguageModelChatToolMode.Auto,
                    },
                    {
                        report: (part) => {
                            parts.push(part);
                            onPart?.();
                        },
                    },
                    token
                );
                return parts;
            }

            function sentBody(index = 0) {
                return JSON.parse(chatRequests[index].body as string);
            }

            function isError(code: string, message: RegExp) {
                return (e: unknown) =>
                    e instanceof LanguageModelError &&
                    e.code === code &&
                    message.test(e.message);
            }

            beforeEach(() => {
                when(mockConnectionManager.responsesClient).thenReturn(
                    newResponsesClient()
                );
            });

            it("streams the reply's text and tool calls", async () => {
                respondToChat = async () =>
                    sseResponse(
                        {type: "response.output_text.delta", delta: "Hel"},
                        {type: "response.output_text.delta", delta: "lo"},
                        {
                            type: "response.output_item.done",
                            item: {
                                type: "function_call",
                                call_id: "call-1",
                                name: "read_file",
                                arguments: '{"path":"a.txt"}',
                            },
                        },
                        {type: "response.completed", response: {}}
                    );

                assert.deepStrictEqual(await chat(), [
                    new LanguageModelTextPart("Hel"),
                    new LanguageModelTextPart("lo"),
                    new LanguageModelToolCallPart("call-1", "read_file", {
                        path: "a.txt",
                    }),
                ]);
            });

            it("sends the whole conversation and the tools each turn", async () => {
                await chat();
                await chat([
                    LanguageModelChatMessage.User("Hi"),
                    LanguageModelChatMessage.Assistant([
                        new LanguageModelToolCallPart(
                            "call-1",
                            "read_file",
                            {}
                        ),
                    ]),
                    LanguageModelChatMessage.User([
                        new LanguageModelToolResultPart("call-1", [
                            new LanguageModelTextPart("contents"),
                        ]),
                    ]),
                ]);

                assert.equal(sentBody(0).model, "system.ai.gpt-5");
                assert.equal(sentBody(0).input.length, 1);
                assert.deepStrictEqual(
                    sentBody(1).input.map(
                        (item: {type?: string; role?: string}) =>
                            item.type ?? item.role
                    ),
                    ["user", "function_call", "function_call_output"]
                );
                assert.equal(sentBody(1).tools[0].name, "read_file");
            });

            it("asks to sign in when signed out", async () => {
                when(mockConnectionManager.responsesClient).thenReturn(
                    undefined
                );

                await assert.rejects(
                    chat(),
                    isError(
                        LanguageModelError.NoPermissions().code,
                        /Sign in to Unity Gateway/
                    )
                );
                assert.equal(chatRequests.length, 0);
            });

            it("ends the turn with the gateway's reason when it refuses", async () => {
                const refused =
                    (statusCode: number, message: string) =>
                    async (): Promise<HttpResponse> => ({
                        statusCode,
                        headers: new Headers({
                            "content-type": "application/json",
                        }),
                        body: new Response(
                            JSON.stringify({error_code: "ERROR", message})
                        ).body,
                    });
                const cases: [
                    HttpResponse | (() => Promise<HttpResponse>),
                    (e: unknown) => boolean,
                ][] = [
                    [
                        refused(401, "Invalid token"),
                        isError(
                            LanguageModelError.NoPermissions().code,
                            /^Unity Gateway returned HTTP 401: Invalid token$/
                        ),
                    ],
                    [
                        refused(403, "No access"),
                        isError(
                            LanguageModelError.NoPermissions().code,
                            /HTTP 403: No access/
                        ),
                    ],
                    [
                        refused(404, "No such model"),
                        isError(
                            LanguageModelError.NotFound().code,
                            /HTTP 404: No such model/
                        ),
                    ],
                    [
                        refused(429, "Slow down"),
                        isError(
                            LanguageModelError.Blocked().code,
                            /HTTP 429: Slow down/
                        ),
                    ],
                    [
                        refused(
                            400,
                            JSON.stringify({
                                error: {
                                    message: "Unknown name exclusiveMinimum",
                                },
                            })
                        ),
                        (e) =>
                            !(e instanceof LanguageModelError) &&
                            e instanceof Error &&
                            e.message ===
                                "Unity Gateway returned HTTP 400: Unknown name exclusiveMinimum",
                    ],
                    [
                        refused(400, "x".repeat(1000)),
                        (e) =>
                            e instanceof Error &&
                            e.message.endsWith("x".repeat(300) + "…") &&
                            !e.message.includes("x".repeat(301)),
                    ],
                    [
                        htmlResponse(502),
                        (e) =>
                            e instanceof Error &&
                            e.message === "Unity Gateway returned HTTP 502",
                    ],
                ];
                for (const [response, check] of cases) {
                    respondToChat =
                        typeof response === "function"
                            ? response
                            : async () => response;

                    await assert.rejects(chat(), check);
                }
            });

            it("ends the turn when the reply fails partway", async () => {
                respondToChat = async () =>
                    sseResponse(
                        {type: "response.output_text.delta", delta: "Hel"},
                        {
                            type: "response.failed",
                            response: {error: {message: "backend exploded"}},
                        }
                    );
                const parts: LanguageModelResponsePart[] = [];

                await assert.rejects(
                    provider.provideLanguageModelChatResponse(
                        model,
                        [LanguageModelChatMessage.User("Hi")],
                        {toolMode: LanguageModelChatToolMode.Auto},
                        {report: (part) => parts.push(part)},
                        new CancellationTokenSource().token
                    ),
                    /backend exploded/
                );
                assert.deepStrictEqual(parts, [
                    new LanguageModelTextPart("Hel"),
                ]);
            });

            it("shows a failure from outside the gateway whole", async () => {
                // As the CLI reports a sign-in it can't refresh.
                const failure = new Error(
                    "databricks-cli: cannot get access token: " +
                        "x".repeat(500) +
                        " Re-authenticate: databricks auth login --profile p"
                );
                const config = mock(Config);
                when(config.authenticate(anything())).thenReject(failure);
                when(mockConnectionManager.responsesClient).thenReturn(
                    newResponsesClient(instance(config))
                );

                await assert.rejects(
                    chat(),
                    (e) => e instanceof Error && e.message === failure.message
                );
            });

            it("ends the turn with what was thrown when it isn't an Error", async () => {
                respondToChat = () => Promise.reject("socket hang up");

                await assert.rejects(
                    chat(),
                    (e) => e instanceof Error && e.message === "socket hang up"
                );
            });

            it("shows the code of a connection that failed on every address", async () => {
                // As Node reports one when it tries each of a host's addresses.
                const failure = Object.assign(
                    new AggregateError(
                        [
                            new Error("connect ECONNREFUSED 127.0.0.1:443"),
                            new Error("connect ECONNREFUSED ::1:443"),
                        ],
                        ""
                    ),
                    {code: "ECONNREFUSED"}
                );
                respondToChat = () => Promise.reject(failure);

                await assert.rejects(
                    chat(),
                    (e) => e instanceof Error && e.message === "ECONNREFUSED"
                );
            });

            it("stops the request when the chat is cancelled", async () => {
                respondToChat = async ({signal}) => ({
                    statusCode: 200,
                    headers: new Headers(),
                    body: new ReadableStream({
                        start(controller) {
                            controller.enqueue(
                                new TextEncoder().encode(
                                    'data: {"type":"response.output_text.delta","delta":"Hel"}\n\n'
                                )
                            );
                            signal?.addEventListener("abort", () =>
                                controller.error(new Error("aborted"))
                            );
                        },
                    }),
                });
                const cancellation = new CancellationTokenSource();

                await assert.rejects(
                    chat(undefined, cancellation.token, () =>
                        cancellation.cancel()
                    ),
                    (e) => e instanceof CancellationError
                );
                assert.equal(chatRequests[0].signal?.aborted, true);
            });

            it("logs the error when chat fails", async () => {
                const failure = new Error("connect ECONNREFUSED");
                respondToChat = async () => {
                    throw failure;
                };
                let thrown: unknown;

                const errors = await loggedErrors(() =>
                    chat().catch((e) => (thrown = e))
                );

                assert.deepStrictEqual(errors, [
                    ["Unity Gateway chat request failed", failure],
                ]);
                assert.ok(thrown instanceof Error);
                assert.equal(thrown.message, "connect ECONNREFUSED");
                assert.notStrictEqual(thrown, failure);
                assert.strictEqual(thrown.cause, undefined);
            });
        });

        it("estimates four characters per token, tool parts included", async () => {
            const model = {} as LanguageModelChatInformation;

            assert.equal(await provider.provideTokenCount(model, "abcde"), 2);
            assert.equal(
                await provider.provideTokenCount(
                    model,
                    LanguageModelChatMessage.Assistant([
                        new LanguageModelTextPart("abcd"),
                        new LanguageModelToolCallPart("call-1", "tool", {
                            a: 1,
                        }),
                    ])
                ),
                Math.ceil(("abcd" + "tool" + '{"a":1}').length / 4)
            );
            assert.equal(
                await provider.provideTokenCount(
                    model,
                    LanguageModelChatMessage.User([
                        new LanguageModelToolResultPart("call-1", [
                            new LanguageModelTextPart("x".repeat(400)),
                            new LanguageModelPromptTsxPart({b: 2}),
                        ]),
                    ])
                ),
                Math.ceil((400 + '{"b":2}'.length) / 4)
            );
        });

        it("counts text and JSON data parts", async () => {
            const message = {
                role: LanguageModelChatMessageRole.Assistant,
                name: undefined,
                content: [
                    new LanguageModelToolResultPart("call-1", [
                        new LanguageModelDataPart(
                            new TextEncoder().encode('{"c":3}'),
                            "Application/JSON"
                        ),
                    ]),
                    new LanguageModelDataPart(
                        new Uint8Array(1000),
                        "text/plain"
                    ),
                    new LanguageModelDataPart(
                        new Uint8Array(1000),
                        "image/png"
                    ),
                ],
            };

            assert.equal(
                await provider.provideTokenCount(
                    {} as LanguageModelChatInformation,
                    message
                ),
                Math.ceil(('{"c":3}'.length + 1000) / 4)
            );
        });
    });

    describe("registerUnityGatewayChatProvider", () => {
        let enabled: boolean;
        let onDidChangeEnabled: EventEmitter<void>;
        let registered: LanguageModelChatProvider[];
        let unregistered: number;
        let registration: Disposable | undefined;

        function setEnabled(value: boolean) {
            enabled = value;
            onDidChangeEnabled.fire();
        }

        function register() {
            registration = registerUnityGatewayChatProvider(
                instance(mockConnectionManager),
                () => enabled,
                onDidChangeEnabled.event,
                (provider) => {
                    registered.push(provider);
                    return new Disposable(() => unregistered++);
                }
            );
        }

        beforeEach(() => {
            enabled = false;
            onDidChangeEnabled = new EventEmitter();
            registered = [];
            unregistered = 0;
            registration = undefined;
        });

        afterEach(() => {
            registration?.dispose();
            onDidChangeEnabled.dispose();
        });

        it("registers the provider at once when already opted in", () => {
            enabled = true;

            register();

            assert.equal(registered.length, 1);
        });

        it("registers the provider only while opted in", () => {
            register();
            assert.equal(registered.length, 0);

            setEnabled(true);
            setEnabled(true);
            assert.equal(registered.length, 1);

            setEnabled(false);
            assert.equal(unregistered, 1);

            setEnabled(true);
            assert.equal(registered.length, 2);
        });

        it("disposes the provider when opting out", () => {
            register();
            setEnabled(true);
            let changes = 0;
            registered[0].onDidChangeLanguageModelChatInformation!(
                () => changes++
            );

            setEnabled(false);
            onDidChangeConnection.fire();

            assert.equal(changes, 0);
        });

        it("logs a failed registration instead of throwing", async () => {
            enabled = true;

            const failure = new Error("no language model API");

            const errors = await loggedErrors(async () => {
                registration = registerUnityGatewayChatProvider(
                    instance(mockConnectionManager),
                    () => enabled,
                    onDidChangeEnabled.event,
                    () => {
                        throw failure;
                    }
                );
            });

            assert.deepStrictEqual(errors, [
                ["Can't register the Databricks model provider", failure],
            ]);
        });

        it("unregisters the provider when disposed", () => {
            register();
            setEnabled(true);

            registration?.dispose();

            assert.equal(unregistered, 1);
        });
    });
});
