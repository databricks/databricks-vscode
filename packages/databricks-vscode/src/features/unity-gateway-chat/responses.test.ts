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
import { describe, expect, it } from "vitest";
import { StreamError, UnfinishedReplyError } from "./replyErrors";
import {
    gatewayMessage,
    toResponseParts,
    toResponsesRequest,
    unwrapCode,
    unwrapMessage,
} from "./responses";

const model: LanguageModelChatInformation = {
    id: "system.ai.gpt-5",
    name: "gpt-5",
    family: "gpt-5",
    version: "1",
    maxInputTokens: 128_000,
    maxOutputTokens: 4_096,
    capabilities: { toolCalling: true },
};
const autoMode: ProvideLanguageModelChatResponseOptions = {
    toolMode: LanguageModelChatToolMode.Auto,
};
// Copilot's system prompt role, which the stable API doesn't declare.
const SYSTEM: LanguageModelChatMessageRole = Number("3");

const input = (...messages: LanguageModelChatRequestMessage[]) =>
    toResponsesRequest(model, messages, autoMode).input;

/** The parts reported, collected into `reported` so they survive a failure. */
async function parts(
    events: unknown[],
    reported: LanguageModelResponsePart[] = [],
): Promise<LanguageModelResponsePart[]> {
    for await (const part of toResponseParts(
        (async function* () {
            yield* events;
        })(),
    )) {
        reported.push(part);
    }
    return reported;
}

const functionCallDone = (args: string) => ({
    type: "response.output_item.done",
    item: { type: "function_call", call_id: "call-1", name: "read_file", arguments: args },
});
const completed = { type: "response.completed", response: {} };
const incomplete = {
    type: "response.incomplete",
    response: { incomplete_details: { reason: "max_output_tokens" } },
};

describe("toResponsesRequest", () => {
    it("builds a streaming request for the model, with no output cap or model options", () => {
        expect(
            toResponsesRequest(model, [LanguageModelChatMessage.User("Hi")], {
                ...autoMode,
                modelOptions: { _capturingTokenCorrelationId: "1" },
            }),
        ).toEqual({
            model: "system.ai.gpt-5",
            input: [{ role: "user", content: "Hi" }],
            stream: true,
        });
    });

    it("sends each message with its role, including the system prompt", () => {
        const system = {
            role: SYSTEM,
            name: undefined,
            content: [new LanguageModelTextPart("Be brief.")],
        };

        expect(
            input(
                system,
                LanguageModelChatMessage.User("Hi"),
                LanguageModelChatMessage.Assistant("Hello"),
            ),
        ).toEqual([
            { role: "system", content: "Be brief." },
            { role: "user", content: "Hi" },
            { role: "assistant", content: "Hello" },
        ]);
    });

    it("orders tool results, then text, then tool calls", () => {
        expect(
            input(
                LanguageModelChatMessage.Assistant([
                    new LanguageModelToolCallPart("call-1", "read_file", { path: "a.txt" }),
                    new LanguageModelTextPart("Reading it."),
                ]),
                LanguageModelChatMessage.User([
                    new LanguageModelTextPart("And then?"),
                    new LanguageModelToolResultPart("call-1", [
                        new LanguageModelTextPart("contents"),
                    ]),
                ]),
            ),
        ).toEqual([
            { role: "assistant", content: "Reading it." },
            {
                type: "function_call",
                call_id: "call-1",
                name: "read_file",
                arguments: '{"path":"a.txt"}',
            },
            { type: "function_call_output", call_id: "call-1", output: "contents" },
            { role: "user", content: "And then?" },
        ]);
    });

    it("sends a tool result's text, data and prompt parts as its output", () => {
        const [item] = input(
            LanguageModelChatMessage.User([
                new LanguageModelToolResultPart("call-1", [
                    new LanguageModelTextPart("a"),
                    new LanguageModelPromptTsxPart({ b: 1 }),
                    new LanguageModelDataPart(
                        new TextEncoder().encode('{"c":2}'),
                        "application/json",
                    ),
                    new LanguageModelDataPart(new Uint8Array(8), "image/png"),
                ]),
            ]),
        );

        expect(item).toEqual({
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
                { value: "thinking" },
                new LanguageModelDataPart(new Uint8Array(1), "cache_control"),
                new LanguageModelTextPart("two"),
            ],
        };

        expect(input(message)).toEqual([{ role: "assistant", content: "onetwo" }]);
    });

    it("sends tool schemas unchanged, without strict mode", () => {
        const inputSchema = {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
                line: { type: "integer", exclusiveMinimum: 0 },
                encoding: { type: ["string", "null"] },
            },
            additionalProperties: true,
        };

        const request = toResponsesRequest(model, [], {
            ...autoMode,
            tools: [
                { name: "read_file", description: "Reads.", inputSchema },
                { name: "list_files", description: "Lists." },
            ],
        });

        expect(request.tools).toEqual([
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
                parameters: { type: "object", properties: {} },
                strict: false,
            },
        ]);
        expect(request.tools?.[0]?.parameters).toBe(inputSchema);
    });

    it("requires a tool call only in Required mode", () => {
        const tools = [{ name: "read_file", description: "Reads." }];
        const toolChoice = (toolMode: LanguageModelChatToolMode) =>
            toResponsesRequest(model, [], { tools, toolMode }).tool_choice;

        expect(toolChoice(LanguageModelChatToolMode.Auto)).toBe("auto");
        expect(toolChoice(LanguageModelChatToolMode.Required)).toBe("required");
        expect(
            toResponsesRequest(model, [], {
                tools: [],
                toolMode: LanguageModelChatToolMode.Required,
            }).tool_choice,
        ).toBeUndefined();
    });
});

describe("toResponseParts", () => {
    it("streams text as it arrives, then each finished tool call", async () => {
        expect(
            await parts([
                { type: "response.created" },
                { type: "response.output_text.delta", delta: "Hel" },
                { type: "response.output_text.delta", delta: "lo" },
                {
                    type: "response.output_item.done",
                    item: { type: "message", content: [{ type: "output_text", text: "Hello" }] },
                },
                { type: "response.output_item.done", item: { type: "reasoning", summary: [] } },
                functionCallDone('{"path":"a.txt"}'),
                completed,
            ]),
        ).toEqual([
            new LanguageModelTextPart("Hel"),
            new LanguageModelTextPart("lo"),
            new LanguageModelToolCallPart("call-1", "read_file", { path: "a.txt" }),
        ]);
    });

    it("reports a message's text when none streamed", async () => {
        expect(
            await parts([
                {
                    type: "response.output_item.done",
                    item: { type: "message", content: [{ type: "output_text", text: "Hello" }] },
                },
                completed,
            ]),
        ).toEqual([new LanguageModelTextPart("Hello")]);
    });

    it("shows a refusal as text", async () => {
        expect(
            await parts([
                {
                    type: "response.output_item.done",
                    item: {
                        type: "message",
                        content: [{ type: "refusal", refusal: "I can't help." }],
                    },
                },
                completed,
            ]),
        ).toEqual([new LanguageModelTextPart("I can't help.")]);
    });

    it("passes on tool arguments that aren't a JSON object", async () => {
        const inputs: unknown[] = [];
        for (const args of ["", "42", "[1,2]", "not json"]) {
            const [call] = await parts([functionCallDone(args), completed]);
            inputs.push(call instanceof LanguageModelToolCallPart ? call.input : call);
        }

        expect(inputs).toEqual([{}, { value: 42 }, { value: [1, 2] }, { value: "not json" }]);
    });

    it("fails with the gateway's message when the reply fails", async () => {
        await expect(
            parts([
                { type: "response.output_text.delta", delta: "Hel" },
                { type: "response.failed", response: { error: { message: "backend exploded" } } },
            ]),
        ).rejects.toThrow(/backend exploded/);
        await expect(parts([{ type: "error", message: "rate limited" }])).rejects.toThrow(
            /rate limited/,
        );
        await expect(parts([{ type: "error", error: "upstream timed out" }])).rejects.toThrow(
            /upstream timed out/,
        );
    });

    it("shows the backend's message from a failure, cut to 300 characters", async () => {
        const message = JSON.stringify({ error: { message: "x".repeat(1000) } });

        await expect(
            parts([{ type: "response.failed", response: { error: { message } } }]),
        ).rejects.toThrow(`Unity Gateway couldn't finish the reply: ${"x".repeat(300)} …`);
    });

    it("fails on an error sent without a type", async () => {
        await expect(
            parts([
                { type: "response.output_text.delta", delta: "Hel" },
                { error_code: "INTERNAL_ERROR", message: "backend down" },
            ]),
        ).rejects.toThrow(/backend down/);
        await expect(parts([{ error: { message: "upstream died" } }])).rejects.toThrow(
            /upstream died/,
        );
    });

    it.each([
        [
            "a Databricks error beside a string error",
            { error: "Service busy", error_code: "TEMPORARILY_UNAVAILABLE" },
            "TEMPORARILY_UNAVAILABLE",
            "Service busy",
        ],
        [
            "a Databricks code beside an error object with none",
            { error: { message: "upstream died" }, error_code: "INTERNAL_ERROR" },
            "INTERNAL_ERROR",
            "upstream died",
        ],
        [
            "a string code over a numeric one",
            { code: 500, error_code: "INTERNAL_ERROR", message: "backend down" },
            "INTERNAL_ERROR",
            "backend down",
        ],
        [
            "a failed response",
            {
                type: "response.failed",
                response: { error: { code: "server_error", message: "backend exploded" } },
            },
            "server_error",
            "backend exploded",
        ],
        [
            "an error event",
            { type: "error", code: "rate_limit_exceeded", message: "rate limited" },
            "rate_limit_exceeded",
            "rate limited",
        ],
    ])("reads the code and message of %s from the same error", async (_, event, code, message) => {
        const error = await parts([event]).then(
            () => undefined,
            (e: unknown) => e,
        );

        expect(error).toBeInstanceOf(StreamError);
        expect(error).toMatchObject({
            code,
            message: `Unity Gateway couldn't finish the reply: ${message}`,
        });
    });

    it("ignores an event without a type that carries no error", async () => {
        const hi = { type: "response.output_text.delta", delta: "Hi" };

        expect(await parts([{ id: 1 }, { error: null, error_code: null }, hi, completed])).toEqual([
            new LanguageModelTextPart("Hi"),
        ]);
    });

    it("reports the reply's token counts last, in the usage part Chat reads", async () => {
        const hi = { type: "response.output_text.delta", delta: "Hi" };
        // GPT-5.5's shape; Gemini sends no details.
        const gpt = {
            input_tokens: 1200,
            input_tokens_details: { cache_write_tokens: 0, cached_tokens: 1024 },
            output_tokens: 18,
            output_tokens_details: { reasoning_tokens: 11 },
            total_tokens: 1218,
        };
        const gemini = { input_tokens: 6, output_tokens: 1, total_tokens: 7 };
        const reported = async (usage: object) =>
            parts([hi, { type: "response.completed", response: { usage } }]);

        expect(await reported(gpt)).toEqual([
            new LanguageModelTextPart("Hi"),
            LanguageModelDataPart.json(
                {
                    prompt_tokens: 1200,
                    completion_tokens: 18,
                    total_tokens: 1218,
                    prompt_tokens_details: { cached_tokens: 1024 },
                    completion_tokens_details: { reasoning_tokens: 11 },
                },
                "usage",
            ),
        ]);
        expect(await reported(gemini)).toEqual([
            new LanguageModelTextPart("Hi"),
            LanguageModelDataPart.json(
                { prompt_tokens: 6, completion_tokens: 1, total_tokens: 7 },
                "usage",
            ),
        ]);
    });

    it("reports no token counts when the gateway sends none", async () => {
        const hi = { type: "response.output_text.delta", delta: "Hi" };

        for (const response of [
            {},
            { usage: null },
            { usage: { input_tokens: "12", output_tokens: 18 } },
            { usage: { input_tokens: 12 } },
        ]) {
            expect(await parts([hi, { type: "response.completed", response }])).toEqual([
                new LanguageModelTextPart("Hi"),
            ]);
        }
    });

    it("fails a reply that completes with nothing to show, naming the response", async () => {
        await expect(
            parts([
                { type: "response.output_item.done", item: { type: "reasoning", summary: [] } },
                { type: "response.completed", response: { id: "resp_1" } },
            ]),
        ).rejects.toThrow("Unity Gateway sent an empty reply (response resp_1).");
        await expect(parts([completed])).rejects.toThrow("Unity Gateway sent an empty reply.");
    });

    it("fails a reply that stops early, after what has streamed", async () => {
        const shown: LanguageModelResponsePart[] = [];

        await expect(
            parts([{ type: "response.output_text.delta", delta: "Hel" }, incomplete], shown),
        ).rejects.toThrow(/stopped the reply early: max_output_tokens/);
        expect(shown).toEqual([new LanguageModelTextPart("Hel")]);
        await expect(parts([incomplete])).rejects.toThrow(/max_output_tokens/);
    });

    it("drops a tool call the output limit cut off", async () => {
        const shown: LanguageModelResponsePart[] = [];

        await expect(
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
                shown,
            ),
        ).rejects.toThrow(/max_output_tokens/);
        expect(shown).toEqual([]);
    });

    it("fails when the stream ends before the reply completes", async () => {
        const error = parts([{ type: "response.output_text.delta", delta: "Hel" }]);

        await expect(error).rejects.toBeInstanceOf(UnfinishedReplyError);
        await expect(error).rejects.toThrow(/ended the reply before it finished/);
    });

    it("tells the caller once, at the stream's first event, even one that isn't a record", async () => {
        let calls = 0;
        const events = (async function* () {
            yield "keep-alive";
            yield { type: "response.output_text.delta", delta: "Hi" };
            yield completed;
        })();

        for await (const part of toResponseParts(events, () => calls++)) {
            void part;
        }

        expect(calls).toBe(1);
    });
});

describe("gatewayMessage", () => {
    it("unwraps a JSON error's message, in any of the three shapes, and keeps other text as it is", () => {
        expect(gatewayMessage('{"error":{"message":"bad schema"}}')).toBe("bad schema");
        expect(gatewayMessage('{"detail":{"message":"Guardrail blocked"}}')).toBe(
            "Guardrail blocked",
        );
        expect(gatewayMessage('{"message":"not wrapped"}')).toBe("not wrapped");
        expect(gatewayMessage('{"error_code":"RESOURCE_EXHAUSTED"}')).toBe(
            '{"error_code":"RESOURCE_EXHAUSTED"}',
        );
        expect(gatewayMessage("  plain\n")).toBe("plain");
        expect(gatewayMessage(undefined)).toBe("");
    });

    it("cuts a long message at a sentence end, else a word break", () => {
        const sentence = `${"a".repeat(200)}.`;
        expect(gatewayMessage(`${sentence} ${"b".repeat(50)} ${"c".repeat(100)}`)).toBe(
            `${sentence} …`,
        );
        // Including one that ends right at the limit.
        const sentences = `${"a".repeat(200)}. ${"b".repeat(97)}.`;
        expect(gatewayMessage(`${sentences} more`)).toBe(`${sentences} …`);
        // A sentence end that would drop most of it doesn't count.
        const words = `Failed. ${"y".repeat(250)}`;
        expect(gatewayMessage(`${words} ${"z".repeat(100)}`)).toBe(`${words} …`);
        expect(gatewayMessage("x".repeat(1000))).toBe(`${"x".repeat(300)} …`);
        expect(gatewayMessage("x".repeat(300))).toBe("x".repeat(300));
    });
});

describe("unwrapMessage", () => {
    it("is undefined for JSON without a message, and the text itself when it isn't JSON", () => {
        expect(unwrapMessage('{"error":"not an object"}')).toBeUndefined();
        expect(unwrapMessage("[1]")).toBeUndefined();
        expect(unwrapMessage("<html>")).toBe("<html>");
    });
});

describe("unwrapCode", () => {
    it.each([
        [
            "an OpenAI-style error",
            { error: { code: "context_length_exceeded" } },
            "context_length_exceeded",
        ],
        [
            "a guardrail",
            { detail: { error_code: "INVALID_PARAMETER_VALUE" } },
            "INVALID_PARAMETER_VALUE",
        ],
        [
            "a Databricks error",
            { error_code: "RESOURCE_EXHAUSTED", message: "x" },
            "RESOURCE_EXHAUSTED",
        ],
        ["JSON with only a message", { message: "x" }, undefined],
        ["a null code", { error: { code: null, message: "x" } }, undefined],
    ])("reads the code of %s", (_, body, code) => {
        expect(unwrapCode(JSON.stringify(body))).toBe(code);
    });

    it("finds none in text that isn't JSON", () => {
        expect(unwrapCode("<html><body>Bad gateway</body></html>")).toBeUndefined();
        expect(unwrapCode("")).toBeUndefined();
    });
});
