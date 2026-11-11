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
import type {
    ResponsesFunctionTool,
    ResponsesInputItem,
    ResponsesRequest,
} from "../../kernel/unity-gateway/UnityGatewayResponsesClient";
import { EmptyReplyError } from "../../kernel/unity-gateway/UnityGatewayResponsesClient";
import { IncompleteReplyError, StreamError, UnfinishedReplyError } from "./replyErrors";

/**
 * A streaming Responses request with the whole conversation: the route keeps
 * no state between turns. Tool schemas are sent as given. It sets no output
 * cap: some models reject one above their own limit, which the gateway doesn't
 * report, so each model uses its default. Ported from the old extension.
 */
export function toResponsesRequest(
    model: LanguageModelChatInformation,
    messages: readonly LanguageModelChatRequestMessage[],
    options: ProvideLanguageModelChatResponseOptions,
): ResponsesRequest {
    const tools = (options.tools ?? []).map((tool): ResponsesFunctionTool => ({
        type: "function",
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema ?? { type: "object", properties: {} },
        // Otherwise OpenAI makes the schema strict where it can, which
        // requires a value for every optional parameter.
        strict: false,
    }));
    return {
        model: model.id,
        input: messages.flatMap(toInputItems),
        ...(tools.length > 0 && {
            tools,
            tool_choice:
                options.toolMode === LanguageModelChatToolMode.Required ? "required" : "auto",
        }),
        stream: true,
    };
}

function toInputItems(message: LanguageModelChatRequestMessage): ResponsesInputItem[] {
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
        items.push({ role: toRole(message.role), content: text });
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

function toRole(role: LanguageModelChatMessageRole): "user" | "assistant" | "system" {
    switch (role) {
        case LanguageModelChatMessageRole.User:
            return "user";
        case LanguageModelChatMessageRole.Assistant:
            return "assistant";
        default:
            // Copilot sends its system prompt with the System role, which the stable API doesn't declare yet.
            return "system";
    }
}

/**
 * Turns a Responses event stream into chat response parts: text as it
 * streams, each tool call once it's complete, then the token counts. Throws
 * if the stream fails, ends early or completes with nothing to show.
 * `onFirstEvent` runs when the stream sends its first event, which can come
 * before any part.
 */
export async function* toResponseParts(
    events: AsyncIterable<unknown>,
    onFirstEvent?: () => void,
): AsyncGenerator<LanguageModelResponsePart> {
    let textStreamed = false;
    let replied = false;
    let first = onFirstEvent;
    for await (const event of events) {
        first?.();
        first = undefined;
        if (!isRecord(event)) {
            continue;
        }
        // Databricks-style errors sent mid-stream have no type.
        const failed =
            event.type === undefined && (event.error_code ?? event.error ?? null) !== null;
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
            case "response.completed": {
                // The gateway reports some content-filter stops this way.
                if (!replied) {
                    throw new EmptyReplyError(emptyReplyMessage(event.response));
                }
                const usage = usagePart(event.response);
                if (usage !== undefined) {
                    yield usage;
                }
                return;
            }
            case "response.incomplete":
                // Chat keeps what has streamed, and shows why it stopped.
                throw new IncompleteReplyError(incompleteReason(event.response));
            case "response.failed":
            case "error": {
                const { message, code } = streamError(event);
                throw new StreamError(
                    `Unity Gateway couldn't finish the reply: ${message !== "" ? message : "unknown error"}`,
                    code,
                );
            }
        }
    }
    throw new UnfinishedReplyError();
}

function outputItemPart(
    item: unknown,
    textStreamed: boolean,
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
            parseArguments(item.arguments),
        );
    }
    // A message's text normally streams as deltas first.
    if (item.type === "message" && !textStreamed && Array.isArray(item.content)) {
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
        return isRecord(parsed) && !Array.isArray(parsed) ? parsed : { value: parsed };
    } catch {
        return { value };
    }
}

function emptyReplyMessage(response: unknown): string {
    const id =
        isRecord(response) && typeof response.id === "string" ? ` (response ${response.id})` : "";
    return `Unity Gateway sent an empty reply${id}.`;
}

/**
 * The reply's token counts, in the `usage` part Chat and Copilot read them
 * from, in Chat Completions' shape. The stable API has no other way to report
 * them, so without it Chat shows 0 input and 0 output tokens.
 */
function usagePart(response: unknown): LanguageModelDataPart | undefined {
    const usage = isRecord(response) ? response.usage : undefined;
    if (
        !isRecord(usage) ||
        typeof usage.input_tokens !== "number" ||
        typeof usage.output_tokens !== "number"
    ) {
        return undefined;
    }
    const cached = isRecord(usage.input_tokens_details)
        ? usage.input_tokens_details.cached_tokens
        : undefined;
    const reasoning = isRecord(usage.output_tokens_details)
        ? usage.output_tokens_details.reasoning_tokens
        : undefined;
    return LanguageModelDataPart.json(
        {
            prompt_tokens: usage.input_tokens,
            completion_tokens: usage.output_tokens,
            total_tokens: usage.total_tokens,
            ...(typeof cached === "number" && { prompt_tokens_details: { cached_tokens: cached } }),
            ...(typeof reasoning === "number" && {
                completion_tokens_details: { reasoning_tokens: reasoning },
            }),
        },
        "usage",
    );
}

function incompleteReason(response: unknown): string | undefined {
    const details = isRecord(response) ? response.incomplete_details : {};
    return isRecord(details) && typeof details.reason === "string" ? details.reason : undefined;
}

/**
 * A stream error's message and code: a Responses error's `{code, message}`,
 * on the event or its response, or a Databricks error, whose `error_code`
 * can sit beside an `error` that is only a string.
 */
function streamError(event: Record<string, unknown>): { message: string; code?: string } {
    const error = isRecord(event.response) ? event.response.error : (event.error ?? event);
    const code = firstString(
        ...(isRecord(error) ? [error.code, error.error_code] : []),
        event.error_code,
    );
    return {
        message: gatewayMessage(isRecord(error) ? error.message : error),
        ...(code !== undefined ? { code } : {}),
    };
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
            .find((cut) => cut !== undefined && cut.length >= MAX_ERROR_LENGTH / 2) ??
        text.slice(0, MAX_ERROR_LENGTH);
    return `${kept} …`;
}

/**
 * The message in a JSON error: `{"message"}`, `{"error": {"message"}}` or
 * `{"detail": {"message"}}`. Undefined for JSON without one, and the text
 * itself when it isn't JSON.
 */
export function unwrapMessage(text: string): string | undefined {
    const parsed = parseJson(text);
    if (parsed === NOT_JSON) {
        return text;
    }
    const error = errorObject(parsed);
    return isRecord(error) && typeof error.message === "string" ? error.message : undefined;
}

/**
 * The code in a JSON error, where `unwrapMessage` finds the message: a
 * Responses or model error's `code`, or a Databricks `error_code`.
 */
export function unwrapCode(text: string): string | undefined {
    const parsed = parseJson(text);
    const error = parsed === NOT_JSON ? undefined : errorObject(parsed);
    return isRecord(error) ? firstString(error.code, error.error_code) : undefined;
}

const NOT_JSON = Symbol("not JSON");

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return NOT_JSON;
    }
}

/** The error object of a JSON error: the body itself, or its `error` or `detail` object. */
function errorObject(parsed: unknown): unknown {
    return (isRecord(parsed) ? [parsed.error, parsed.detail].find(isRecord) : undefined) ?? parsed;
}

function firstString(...values: unknown[]): string | undefined {
    return values.find((value): value is string => typeof value === "string" && value !== "");
}

/** The HTTP status of a request the gateway refused; 0 for any other failure (the SDK reports -1). */
export function httpStatus(e: unknown): number {
    return isRecord(e) && typeof e.httpStatusCode === "number" && e.httpStatusCode > 0
        ? e.httpStatusCode
        : 0;
}

/** A refused request's body as text. */
export function responseBody(e: unknown): string {
    return isRecord(e) && e.httpBody instanceof Uint8Array
        ? new TextDecoder().decode(e.httpBody).trim()
        : "";
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
    if (part instanceof LanguageModelDataPart && /^text\/|json/i.test(part.mimeType)) {
        return new TextDecoder().decode(part.data);
    }
    return "";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}
