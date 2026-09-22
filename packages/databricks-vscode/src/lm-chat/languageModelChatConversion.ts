/* eslint-disable @typescript-eslint/naming-convention */
import {
    OpaqueAssistantStateStore,
    rehydrateAssistantMessage,
} from "./OpaqueAssistantStateStore";
import type {
    LanguageModelChatRequestMessage,
    LanguageModelResponsePart,
    LanguageModelTextPart,
    LanguageModelToolCallPart,
    LanguageModelToolResultPart,
    OpenAIChatAssistantMessage,
    OpenAIChatCompletionResponse,
    OpenAIChatMessage,
    OpenAIChatToolCall,
    ProvideLanguageModelChatResponseOptions,
    UnityGatewayRequestPayload,
} from "./types";
import {
    createLanguageModelDataPart,
    createLanguageModelTextPart,
    createLanguageModelToolCallPart,
    isLanguageModelDataPart,
    isLanguageModelTextPart,
    isLanguageModelToolCallPart,
    isLanguageModelToolResultPart,
    isRequiredToolMode,
    RAW_ASSISTANT_MESSAGE_MIME,
} from "./vscodeLanguageModelChat";

// Unity Gateway translates this schema for several providers. Keep only the
// shared OpenAPI-style subset rather than branching on individual models.
const PORTABLE_TOOL_SCHEMA_KEYS = new Set([
    "type",
    "format",
    "title",
    "description",
    "nullable",
    "enum",
    "properties",
    "required",
    "items",
    "minItems",
    "maxItems",
    "minLength",
    "maxLength",
    "pattern",
    "minimum",
    "maximum",
    "minProperties",
    "maxProperties",
    "anyOf",
]);

export function toOpenAIChatMessages(
    messages: readonly LanguageModelChatRequestMessage[],
    opaqueAssistantState?: OpaqueAssistantStateStore
): OpenAIChatMessage[] {
    const input: OpenAIChatMessage[] = [];
    for (const message of messages) {
        const role = message.role === 1 ? "user" : "assistant";
        const text = message.content
            .filter((part): part is LanguageModelTextPart =>
                isLanguageModelTextPart(part)
            )
            .map((part) => part.value)
            .filter((value) => value !== "")
            .join("\n");
        const toolCalls = message.content
            .filter((part): part is LanguageModelToolCallPart =>
                isLanguageModelToolCallPart(part)
            )
            .map(toOpenAIChatToolCall);

        if (role === "assistant" && toolCalls.length > 0) {
            const rawMessage = readRawAssistantMessage(message.content);
            input.push(
                rawMessage !== undefined
                    ? rehydrateAssistantMessage(rawMessage, toolCalls)
                    : opaqueAssistantState?.restore(toolCalls) ?? {
                          role,
                          content: text === "" ? null : text,
                          tool_calls: toolCalls,
                      }
            );
        } else if (role === "assistant") {
            const rawMessage = readRawAssistantMessage(message.content);
            if (rawMessage !== undefined) {
                input.push(rawMessage);
                continue;
            }
            if (text !== "") {
                input.push({role, content: text});
            }
        } else if (text !== "") {
            input.push({role, content: text});
        }

        for (const part of message.content) {
            if (!isLanguageModelToolResultPart(part)) {
                continue;
            }
            const output = toolResultText(part);
            input.push({
                role: "tool",
                tool_call_id: part.callId,
                content: output === "" ? "(no output)" : output,
            });
        }
    }
    return input;
}

export function toOpenAIChatToolOptions(
    options: ProvideLanguageModelChatResponseOptions,
    toolCalling: boolean | number | undefined
): Pick<UnityGatewayRequestPayload, "tools" | "toolChoice"> {
    if (
        !toolCalling ||
        options.tools === undefined ||
        options.tools.length === 0
    ) {
        return {};
    }
    return {
        tools: options.tools.map((tool) => ({
            type: "function",
            function: {
                name: tool.name,
                description: tool.description ?? tool.name,
                parameters: toPortableToolSchema(
                    tool.inputSchema ?? {
                        type: "object",
                        properties: {},
                    }
                ),
            },
        })),
        toolChoice: isRequiredToolMode(options.toolMode) ? "required" : "auto",
    };
}

function toPortableToolSchema(
    schema: Readonly<Record<string, unknown>>
): Record<string, unknown> {
    const portableSchema: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema)) {
        if (!PORTABLE_TOOL_SCHEMA_KEYS.has(key)) {
            continue;
        }
        if (key === "type") {
            if (typeof value === "string") {
                portableSchema[key] = value;
            } else if (isNullableType(value)) {
                portableSchema[key] = value.find((type) => type !== "null");
                portableSchema["nullable"] = true;
            }
        } else if (key === "properties") {
            if (!isRecord(value)) {
                continue;
            }
            portableSchema[key] = Object.fromEntries(
                Object.entries(value)
                    .filter(
                        (entry): entry is [string, Record<string, unknown>] =>
                            isRecord(entry[1])
                    )
                    .map(([name, propertySchema]) => [
                        name,
                        toPortableToolSchema(propertySchema),
                    ])
            );
        } else if (key === "items") {
            if (isRecord(value)) {
                portableSchema[key] = toPortableToolSchema(value);
            }
        } else if (key === "anyOf") {
            if (Array.isArray(value)) {
                portableSchema[key] = value
                    .filter(isRecord)
                    .map(toPortableToolSchema);
            }
        } else {
            portableSchema[key] = value;
        }
    }

    copyExclusiveBound(schema, portableSchema, "Minimum");
    copyExclusiveBound(schema, portableSchema, "Maximum");
    return portableSchema;
}

function copyExclusiveBound(
    source: Readonly<Record<string, unknown>>,
    target: Record<string, unknown>,
    bound: "Minimum" | "Maximum"
): void {
    const portableKey = bound.toLowerCase();
    const exclusiveValue = source[`exclusive${bound}`];
    if (
        target[portableKey] === undefined &&
        typeof exclusiveValue === "number"
    ) {
        target[portableKey] =
            source["type"] === "integer"
                ? exclusiveValue + (bound === "Minimum" ? 1 : -1)
                : exclusiveValue;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableType(value: unknown): value is string[] {
    return (
        Array.isArray(value) &&
        value.length === 2 &&
        value.every((type) => typeof type === "string") &&
        value.includes("null") &&
        value.some((type) => type !== "null")
    );
}

export function toLanguageModelResponseParts(
    body: OpenAIChatCompletionResponse,
    opaqueAssistantState?: OpaqueAssistantStateStore
): LanguageModelResponsePart[] {
    const parts: LanguageModelResponsePart[] = [];
    const toolCalls = body.message.tool_calls ?? [];
    opaqueAssistantState?.remember(body.message);
    if (hasOpaqueAssistantState(body.message)) {
        parts.push(createLanguageModelDataPart(body.message));
    }
    for (const text of assistantMessageText(body.message.content)) {
        parts.push(createLanguageModelTextPart(text));
    }
    for (const toolCall of toolCalls) {
        if (
            toolCall.type === "function" &&
            typeof toolCall.id === "string" &&
            typeof toolCall.function?.name === "string"
        ) {
            parts.push(
                createLanguageModelToolCallPart(
                    toolCall.id,
                    toolCall.function.name,
                    parseToolInput(toolCall.function.arguments)
                )
            );
        }
    }
    return parts;
}

function toOpenAIChatToolCall(
    part: LanguageModelToolCallPart
): OpenAIChatToolCall {
    return {
        id: part.callId,
        type: "function",
        function: {
            name: part.name,
            arguments: JSON.stringify(part.input),
        },
    };
}

function readRawAssistantMessage(
    parts: readonly unknown[]
): OpenAIChatAssistantMessage | undefined {
    for (const part of parts) {
        if (
            !isLanguageModelDataPart(part) ||
            part.mimeType !== RAW_ASSISTANT_MESSAGE_MIME
        ) {
            continue;
        }
        try {
            const value: unknown = JSON.parse(
                new TextDecoder().decode(part.data)
            );
            if (isOpenAIChatAssistantMessage(value)) {
                return value;
            }
        } catch {
            continue;
        }
    }
    return undefined;
}

function isOpenAIChatAssistantMessage(
    value: unknown
): value is OpenAIChatAssistantMessage {
    return (
        typeof value === "object" &&
        value !== null &&
        (value as {role?: unknown}).role === "assistant"
    );
}

function hasOpaqueAssistantState(message: OpenAIChatAssistantMessage): boolean {
    if (
        (message.tool_calls?.length ?? 0) > 0 ||
        (message.content !== undefined &&
            message.content !== null &&
            typeof message.content !== "string")
    ) {
        return true;
    }
    return Object.keys(message).some(
        (key) => key !== "role" && key !== "content" && key !== "refusal"
    );
}

function assistantMessageText(
    content: OpenAIChatAssistantMessage["content"]
): string[] {
    if (typeof content === "string") {
        return content === "" ? [] : [content];
    }
    if (!Array.isArray(content)) {
        return [];
    }
    return content
        .filter(
            (part) =>
                (part.type === "text" || part.type === "output_text") &&
                typeof part.text === "string" &&
                part.text !== ""
        )
        .map((part) => part.text as string);
}

function parseToolInput(value: string | undefined): object {
    if (value === undefined || value === "") {
        return {};
    }
    try {
        const parsed: unknown = JSON.parse(value);
        return typeof parsed === "object" && parsed !== null
            ? parsed
            : {value: parsed};
    } catch {
        return {value};
    }
}

function toolResultText(part: LanguageModelToolResultPart): string {
    return part.content
        .map((content) => {
            if (isLanguageModelTextPart(content)) {
                return content.value;
            }
            if (typeof content === "string") {
                return content;
            }
            try {
                return JSON.stringify(content);
            } catch {
                return String(content);
            }
        })
        .join("\n");
}
