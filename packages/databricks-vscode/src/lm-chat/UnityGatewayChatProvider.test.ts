/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import http from "node:http";
import {
    CancellationTokenSource,
    Disposable,
    EventEmitter,
    LanguageModelChatMessage,
    LanguageModelChatMessageRole,
    LanguageModelDataPart,
    LanguageModelPromptTsxPart,
    LanguageModelTextPart,
    LanguageModelToolCallPart,
    LanguageModelToolResultPart,
} from "vscode";
import type {
    LanguageModelChatInformation,
    LanguageModelChatProvider,
} from "vscode";
import {ApiClient, Config, logging} from "@databricks/sdk-experimental";
import {AiGatewayClient} from "@databricks/sdk-aigateway/v1";
import type {HttpResponse} from "@databricks/sdk-core/http";
import {instance, mock, when} from "ts-mockito";
import {v2ClientOptions} from "../configuration/sdkV2Bridge";
import {
    UnityGatewayChatProvider,
    registerUnityGatewayChatProvider,
} from "./UnityGatewayChatProvider";
import {UnityGatewayConnectionManager} from "./UnityGatewayConnectionManager";

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
                new URL("https://ws.cloud.databricks.com"),
                new http.Agent()
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

    beforeEach(() => {
        mockConnectionManager = mock(UnityGatewayConnectionManager);
        onDidChangeConnection = new EventEmitter();
        when(mockConnectionManager.onDidChange).thenReturn(
            onDidChangeConnection.event
        );
        when(mockConnectionManager.aiGatewayClient).thenReturn(undefined);
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

        it("can't chat yet", async () => {
            await assert.rejects(
                () => provider.provideLanguageModelChatResponse(),
                /isn't available yet/
            );
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
