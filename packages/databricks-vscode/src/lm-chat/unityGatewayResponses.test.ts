/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {
    LanguageModelChatMessage,
    LanguageModelChatMessageRole,
    LanguageModelChatToolMode,
    LanguageModelDataPart,
    LanguageModelPromptTsxPart,
    LanguageModelTextPart,
    LanguageModelToolCallPart,
    LanguageModelToolResultPart,
} from "vscode";
import type {
    LanguageModelChatInformation,
    LanguageModelChatRequestMessage,
    LanguageModelResponsePart,
    ProvideLanguageModelChatResponseOptions,
} from "vscode";
import {toResponseParts, toResponsesRequest} from "./unityGatewayResponses";

describe(__filename, () => {
    const model: LanguageModelChatInformation = {
        id: "system.ai.gpt-5",
        name: "gpt-5",
        family: "gpt-5",
        version: "1",
        maxInputTokens: 128_000,
        maxOutputTokens: 4_096,
        capabilities: {toolCalling: true},
    };
    const autoMode: ProvideLanguageModelChatResponseOptions = {
        toolMode: LanguageModelChatToolMode.Auto,
    };

    describe("toResponsesRequest", () => {
        function input(...messages: LanguageModelChatRequestMessage[]) {
            return toResponsesRequest(model, messages, autoMode).input;
        }

        it("builds a streaming request for the model, with no output cap or model options", () => {
            const request = toResponsesRequest(
                model,
                [LanguageModelChatMessage.User("Hi")],
                {...autoMode, modelOptions: {_capturingTokenCorrelationId: "1"}}
            );

            assert.deepStrictEqual(request, {
                model: "system.ai.gpt-5",
                input: [{role: "user", content: "Hi"}],
                stream: true,
            });
        });

        it("sends each message with its role, including the system prompt", () => {
            // The System role is newer than the 1.104 API.
            const system = {
                role: 3 as LanguageModelChatMessageRole,
                name: undefined,
                content: [new LanguageModelTextPart("Be brief.")],
            };

            assert.deepStrictEqual(
                input(
                    system,
                    LanguageModelChatMessage.User("Hi"),
                    LanguageModelChatMessage.Assistant("Hello")
                ),
                [
                    {role: "system", content: "Be brief."},
                    {role: "user", content: "Hi"},
                    {role: "assistant", content: "Hello"},
                ]
            );
        });

        it("orders tool results, then text, then tool calls", () => {
            assert.deepStrictEqual(
                input(
                    LanguageModelChatMessage.Assistant([
                        new LanguageModelToolCallPart("call-1", "read_file", {
                            path: "a.txt",
                        }),
                        new LanguageModelTextPart("Reading it."),
                    ]),
                    LanguageModelChatMessage.User([
                        new LanguageModelTextPart("And then?"),
                        new LanguageModelToolResultPart("call-1", [
                            new LanguageModelTextPart("contents"),
                        ]),
                    ])
                ),
                [
                    {role: "assistant", content: "Reading it."},
                    {
                        type: "function_call",
                        call_id: "call-1",
                        name: "read_file",
                        arguments: '{"path":"a.txt"}',
                    },
                    {
                        type: "function_call_output",
                        call_id: "call-1",
                        output: "contents",
                    },
                    {role: "user", content: "And then?"},
                ]
            );
        });

        it("sends a tool result's text, data and prompt parts as its output", () => {
            const [item] = input(
                LanguageModelChatMessage.User([
                    new LanguageModelToolResultPart("call-1", [
                        new LanguageModelTextPart("a"),
                        new LanguageModelPromptTsxPart({b: 1}),
                        new LanguageModelDataPart(
                            new TextEncoder().encode('{"c":2}'),
                            "application/json"
                        ),
                        new LanguageModelDataPart(
                            new Uint8Array(8),
                            "image/png"
                        ),
                    ]),
                ])
            );

            assert.deepStrictEqual(item, {
                type: "function_call_output",
                call_id: "call-1",
                output: 'a{"b":1}{"c":2}',
            });
        });

        it("joins a message's text parts and drops the rest", () => {
            const message = {
                role: LanguageModelChatMessageRole.Assistant,
                name: undefined,
                content: [
                    new LanguageModelTextPart("one"),
                    new LanguageModelTextPart(""),
                    {value: "thinking"},
                    new LanguageModelDataPart(
                        new Uint8Array(1),
                        "cache_control"
                    ),
                    new LanguageModelTextPart("two"),
                ],
            };

            assert.deepStrictEqual(input(message), [
                {role: "assistant", content: "onetwo"},
            ]);
        });

        it("sends tool schemas unchanged, without strict mode", () => {
            const inputSchema = {
                $schema: "http://json-schema.org/draft-07/schema#",
                type: "object",
                properties: {
                    line: {type: "integer", exclusiveMinimum: 0},
                    encoding: {type: ["string", "null"]},
                },
                additionalProperties: true,
            };

            const request = toResponsesRequest(model, [], {
                ...autoMode,
                tools: [
                    {name: "read_file", description: "Reads.", inputSchema},
                    {name: "list_files", description: "Lists."},
                ],
            });

            assert.deepStrictEqual(request.tools, [
                {
                    type: "function",
                    name: "read_file",
                    description: "Reads.",
                    parameters: inputSchema,
                    strict: false,
                },
                {
                    type: "function",
                    name: "list_files",
                    description: "Lists.",
                    parameters: {type: "object", properties: {}},
                    strict: false,
                },
            ]);
            assert.strictEqual(request.tools?.[0].parameters, inputSchema);
        });

        it("requires a tool call only in Required mode", () => {
            const tools = [{name: "read_file", description: "Reads."}];
            const toolChoice = (toolMode: LanguageModelChatToolMode) =>
                toResponsesRequest(model, [], {tools, toolMode}).tool_choice;

            assert.equal(toolChoice(LanguageModelChatToolMode.Auto), "auto");
            assert.equal(
                toolChoice(LanguageModelChatToolMode.Required),
                "required"
            );
            assert.equal(
                toResponsesRequest(model, [], {
                    tools: [],
                    toolMode: LanguageModelChatToolMode.Required,
                }).tool_choice,
                undefined
            );
        });
    });

    describe("toResponseParts", () => {
        /** The parts reported, collected into `reported` so they survive a failure. */
        async function parts(
            events: unknown[],
            reported: LanguageModelResponsePart[] = []
        ): Promise<LanguageModelResponsePart[]> {
            for await (const part of toResponseParts(
                (async function* () {
                    yield* events;
                })()
            )) {
                reported.push(part);
            }
            return reported;
        }

        function functionCallDone(args: string) {
            return {
                type: "response.output_item.done",
                item: {
                    type: "function_call",
                    call_id: "call-1",
                    name: "read_file",
                    arguments: args,
                },
            };
        }

        const completed = {type: "response.completed", response: {}};
        const incomplete = {
            type: "response.incomplete",
            response: {incomplete_details: {reason: "max_output_tokens"}},
        };

        it("streams text as it arrives, then each finished tool call", async () => {
            assert.deepStrictEqual(
                await parts([
                    {type: "response.created"},
                    {type: "response.output_text.delta", delta: "Hel"},
                    {type: "response.output_text.delta", delta: "lo"},
                    {
                        type: "response.output_item.done",
                        item: {
                            type: "message",
                            content: [{type: "output_text", text: "Hello"}],
                        },
                    },
                    {
                        type: "response.output_item.done",
                        item: {type: "reasoning", summary: []},
                    },
                    functionCallDone('{"path":"a.txt"}'),
                    completed,
                ]),
                [
                    new LanguageModelTextPart("Hel"),
                    new LanguageModelTextPart("lo"),
                    new LanguageModelToolCallPart("call-1", "read_file", {
                        path: "a.txt",
                    }),
                ]
            );
        });

        it("reports a message's text when none streamed", async () => {
            assert.deepStrictEqual(
                await parts([
                    {
                        type: "response.output_item.done",
                        item: {
                            type: "message",
                            content: [{type: "output_text", text: "Hello"}],
                        },
                    },
                    completed,
                ]),
                [new LanguageModelTextPart("Hello")]
            );
        });

        it("shows a refusal as text", async () => {
            assert.deepStrictEqual(
                await parts([
                    {
                        type: "response.output_item.done",
                        item: {
                            type: "message",
                            content: [
                                {type: "refusal", refusal: "I can't help."},
                            ],
                        },
                    },
                    completed,
                ]),
                [new LanguageModelTextPart("I can't help.")]
            );
        });

        it("passes on tool arguments that aren't a JSON object", async () => {
            const inputs = [];
            for (const args of ["", "42", "[1,2]", "not json"]) {
                const [call] = await parts([functionCallDone(args), completed]);
                inputs.push((call as LanguageModelToolCallPart).input);
            }

            assert.deepStrictEqual(inputs, [
                {},
                {value: 42},
                {value: [1, 2]},
                {value: "not json"},
            ]);
        });

        it("fails with the gateway's message when the reply fails", async () => {
            await assert.rejects(
                parts([
                    {type: "response.output_text.delta", delta: "Hel"},
                    {
                        type: "response.failed",
                        response: {error: {message: "backend exploded"}},
                    },
                ]),
                /backend exploded/
            );
            await assert.rejects(
                parts([{type: "error", message: "rate limited"}]),
                /rate limited/
            );
            await assert.rejects(
                parts([{type: "error", error: "upstream timed out"}]),
                /upstream timed out/
            );
        });

        it("shows the backend's message from a failure, cut to 300 characters", async () => {
            const message = JSON.stringify({
                error: {message: "x".repeat(1000)},
            });
            const shown = "x".repeat(300) + "…";

            await assert.rejects(
                parts([
                    {type: "response.failed", response: {error: {message}}},
                ]),
                (e) =>
                    e instanceof Error &&
                    e.message ===
                        `Unity Gateway couldn't finish the reply: ${shown}`
            );
        });

        it("fails on an error sent without a type", async () => {
            await assert.rejects(
                parts([
                    {type: "response.output_text.delta", delta: "Hel"},
                    {error_code: "INTERNAL_ERROR", message: "backend down"},
                ]),
                /backend down/
            );
            await assert.rejects(
                parts([{error: {message: "upstream died"}}]),
                /upstream died/
            );
            assert.deepStrictEqual(await parts([{id: 1}, completed]), []);
        });

        it("fails a reply that stops early, after what has streamed", async () => {
            const shown: LanguageModelResponsePart[] = [];

            await assert.rejects(
                parts(
                    [
                        {type: "response.output_text.delta", delta: "Hel"},
                        incomplete,
                    ],
                    shown
                ),
                /stopped the reply early: max_output_tokens/
            );
            assert.deepStrictEqual(shown, [new LanguageModelTextPart("Hel")]);
            await assert.rejects(parts([incomplete]), /max_output_tokens/);
        });

        it("drops a tool call the output limit cut off", async () => {
            const shown: LanguageModelResponsePart[] = [];

            await assert.rejects(
                parts(
                    [
                        {
                            type: "response.output_item.done",
                            item: {
                                type: "function_call",
                                status: "incomplete",
                                call_id: "call-1",
                                name: "create_file",
                                arguments: '{"path": "a.ts", "content": "ex',
                            },
                        },
                        incomplete,
                    ],
                    shown
                ),
                /max_output_tokens/
            );
            assert.deepStrictEqual(shown, []);
        });

        it("fails when the stream ends before the reply completes", async () => {
            await assert.rejects(
                parts([{type: "response.output_text.delta", delta: "Hel"}]),
                /ended the reply before it finished/
            );
        });
    });
});
