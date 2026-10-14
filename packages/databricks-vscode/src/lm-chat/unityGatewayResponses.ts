/* eslint-disable @typescript-eslint/naming-convention -- Responses API fields */
import {
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

export interface ResponsesRequest {
    model: string;
    input: ResponsesInputItem[];
    tools?: ResponsesFunctionTool[];
    tool_choice?: "auto" | "required";
    stream: true;
}

type ResponsesInputItem =
    | {role: "user" | "assistant" | "system"; content: string}
    | {type: "function_call"; call_id: string; name: string; arguments: string}
    | {type: "function_call_output"; call_id: string; output: string};

interface ResponsesFunctionTool {
    type: "function";
    name: string;
    description: string;
    parameters: object;
    strict: false;
}

/**
 * A streaming Responses request with the whole conversation: the route keeps
 * no state between turns. Tool schemas are sent as given. It sets no output
 * cap: some models reject one above their own limit, which the gateway doesn't
 * report, so each model uses its default.
 */
export function toResponsesRequest(
    model: LanguageModelChatInformation,
    messages: readonly LanguageModelChatRequestMessage[],
    options: ProvideLanguageModelChatResponseOptions
): ResponsesRequest {
    const tools = (options.tools ?? []).map(
        (tool): ResponsesFunctionTool => ({
            type: "function",
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema ?? {type: "object", properties: {}},
            // Otherwise OpenAI makes the schema strict where it can, which
            // requires a value for every optional parameter.
            strict: false,
        })
    );
    return {
        model: model.id,
        input: messages.flatMap(toInputItems),
        ...(tools.length > 0 && {
            tools,
            tool_choice:
                options.toolMode === LanguageModelChatToolMode.Required
                    ? "required"
                    : "auto",
        }),
        stream: true,
    };
}

function toInputItems(
    message: LanguageModelChatRequestMessage
): ResponsesInputItem[] {
    const items: ResponsesInputItem[] = [];
    // Tool results answer the previous turn's calls, so they go first.
    for (const part of message.content) {
        if (part instanceof LanguageModelToolResultPart) {
            items.push({
                type: "function_call_output",
                call_id: part.callId,
                output: partText(part),
            });
        }
    }
    const text = message.content
        .filter((part) => part instanceof LanguageModelTextPart)
        .map((part) => part.value)
        .join("");
    if (text !== "") {
        items.push({role: toRole(message.role), content: text});
    }
    for (const part of message.content) {
        if (part instanceof LanguageModelToolCallPart) {
            items.push({
                type: "function_call",
                call_id: part.callId,
                name: part.name,
                arguments: JSON.stringify(part.input),
            });
        }
    }
    return items;
}

function toRole(
    role: LanguageModelChatMessageRole
): "user" | "assistant" | "system" {
    switch (role) {
        case LanguageModelChatMessageRole.User:
            return "user";
        case LanguageModelChatMessageRole.Assistant:
            return "assistant";
        default:
            // Copilot sends its system prompt with the System role, which is
            // newer than the 1.104 API.
            return "system";
    }
}

/**
 * Turns a Responses event stream into chat response parts: text as it
 * streams, and each tool call once it's complete. Throws if the stream fails,
 * ends early or completes with nothing to show.
 */
export async function* toResponseParts(
    events: AsyncIterable<unknown>
): AsyncGenerator<LanguageModelResponsePart> {
    let textStreamed = false;
    let replied = false;
    for await (const event of events) {
        if (!isRecord(event)) {
            continue;
        }
        // Databricks-style errors sent mid-stream have no type.
        const failed =
            event.type === undefined &&
            (event.error_code ?? event.error ?? null) !== null;
        switch (failed ? "error" : event.type) {
            case "response.output_text.delta":
                if (typeof event.delta === "string" && event.delta !== "") {
                    textStreamed = true;
                    replied = true;
                    yield new LanguageModelTextPart(event.delta);
                }
                break;
            case "response.output_item.done": {
                const part = outputItemPart(event.item, textStreamed);
                if (part !== undefined) {
                    replied = true;
                    yield part;
                }
                break;
            }
            case "response.completed":
                // The gateway reports some content-filter stops this way.
                if (!replied) {
                    throw new Error(emptyReplyMessage(event.response));
                }
                return;
            case "response.incomplete": {
                // Chat keeps what has streamed, and shows why it stopped.
                const reason = incompleteReason(event.response);
                throw new Error(
                    `Unity Gateway stopped the reply early: ${reason}`
                );
            }
            case "response.failed":
            case "error": {
                const message = streamErrorMessage(event);
                throw new Error(
                    `Unity Gateway couldn't finish the reply: ${message}`
                );
            }
        }
    }
    throw new Error("Unity Gateway ended the reply before it finished.");
}

function outputItemPart(
    item: unknown,
    textStreamed: boolean
): LanguageModelResponsePart | undefined {
    if (!isRecord(item)) {
        return undefined;
    }
    if (
        item.type === "function_call" &&
        item.status !== "incomplete" &&
        typeof item.call_id === "string" &&
        typeof item.name === "string"
    ) {
        return new LanguageModelToolCallPart(
            item.call_id,
            item.name,
            parseArguments(item.arguments)
        );
    }
    // A message's text normally streams as deltas first.
    if (
        item.type === "message" &&
        !textStreamed &&
        Array.isArray(item.content)
    ) {
        const text = item.content.map(contentText).join("");
        return text === "" ? undefined : new LanguageModelTextPart(text);
    }
    return undefined;
}

function contentText(content: unknown): string {
    if (!isRecord(content)) {
        return "";
    }
    if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
    }
    // Otherwise a refusal leaves the turn looking empty.
    if (content.type === "refusal" && typeof content.refusal === "string") {
        return content.refusal;
    }
    return "";
}

function parseArguments(value: unknown): object {
    if (typeof value !== "string" || value === "") {
        return {};
    }
    try {
        const parsed: unknown = JSON.parse(value);
        return isRecord(parsed) && !Array.isArray(parsed)
            ? parsed
            : {value: parsed};
    } catch {
        return {value};
    }
}

function emptyReplyMessage(response: unknown): string {
    const id =
        isRecord(response) && typeof response.id === "string"
            ? ` (response ${response.id})`
            : "";
    return `Unity Gateway sent an empty reply${id}.`;
}

function incompleteReason(response: unknown): string {
    const details = isRecord(response) ? response.incomplete_details : {};
    return isRecord(details) && typeof details.reason === "string"
        ? details.reason
        : "unknown reason";
}

function streamErrorMessage(event: Record<string, unknown>): string {
    const error = isRecord(event.response)
        ? event.response.error
        : event.error ?? event;
    const message = isRecord(error) ? error.message : error;
    return typeof message === "string"
        ? gatewayMessage(message)
        : "unknown error";
}

const MAX_ERROR_LENGTH = 300;

/**
 * A gateway error message for Chat to show. The gateway passes the model's
 * own error on, often as JSON, and it can run to kilobytes.
 */
export function gatewayMessage(message: unknown): string {
    if (typeof message !== "string") {
        return "";
    }
    const text = (unwrapMessage(message) ?? message).trim();
    if (text.length <= MAX_ERROR_LENGTH) {
        return text;
    }
    // Cut at the last sentence end, or else word break, that keeps at least
    // half, rather than mid-word. One extra character lets a break just past
    // the limit count.
    const head = text.slice(0, MAX_ERROR_LENGTH + 1);
    const kept =
        [/^[\s\S]*[.!?](?=\s)/, /^[\s\S]*\S(?=\s)/]
            .map((pattern) => pattern.exec(head)?.[0])
            .find(
                (cut) => cut !== undefined && cut.length >= MAX_ERROR_LENGTH / 2
            ) ?? text.slice(0, MAX_ERROR_LENGTH);
    return `${kept} …`;
}

/**
 * The message in a JSON error: `{"message"}`, `{"error": {"message"}}` or
 * `{"detail": {"message"}}`. Undefined for JSON without one, and the text
 * itself when it isn't JSON.
 */
export function unwrapMessage(text: string): string | undefined {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return text;
    }
    const wrapped = isRecord(parsed)
        ? [parsed.error, parsed.detail].find(isRecord)
        : undefined;
    const error = wrapped ?? parsed;
    return isRecord(error) && typeof error.message === "string"
        ? error.message
        : undefined;
}

/** The text a message part carries, for tool results and token counting. */
export function partText(part: unknown): string {
    if (part instanceof LanguageModelTextPart) {
        return part.value;
    }
    if (part instanceof LanguageModelToolCallPart) {
        return part.name + JSON.stringify(part.input);
    }
    if (part instanceof LanguageModelToolResultPart) {
        return part.content.map(partText).join("");
    }
    if (part instanceof LanguageModelPromptTsxPart) {
        return JSON.stringify(part.value) ?? "";
    }
    if (
        part instanceof LanguageModelDataPart &&
        /^text\/|json/i.test(part.mimeType)
    ) {
        return new TextDecoder().decode(part.data);
    }
    return "";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}
