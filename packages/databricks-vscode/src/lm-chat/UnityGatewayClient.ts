/* eslint-disable @typescript-eslint/naming-convention */
import type {CancellationToken} from "vscode";
import {logging} from "@databricks/sdk-experimental";
import {Loggers} from "../logger";
import type {
    LanguageModelChatConnection,
    LanguageModelChatInformation,
    OpenAIChatAssistantMessage,
    OpenAIChatCompletionResponse,
    OpenAIChatToolCall,
    UnityGatewayRequestPayload,
} from "./types";

const WORKSPACE_ID_HEADER = "X-Databricks-Org-Id";
const MODELS_REQUIRING_DISABLED_REASONING = new Set<string>();
let discoverySequence = 0;
type Fetch = typeof fetch;

export async function discoverUnityGatewayModels(
    connection: LanguageModelChatConnection,
    token: CancellationToken,
    fetcher: Fetch = fetch
): Promise<LanguageModelChatInformation[]> {
    const client = connection.apiClient;
    if (client === undefined) {
        getLogger().debug(
            "[LanguageModelChat] Skipping model discovery: no API client"
        );
        return [];
    }
    const discoveryId = ++discoverySequence;
    const startedAt = Date.now();
    let cancellationObserved = false;
    const cancellationListener = token.onCancellationRequested(() => {
        cancellationObserved = true;
        getLogger().info(
            "[LanguageModelChat] Model discovery cancellation requested",
            {
                discoveryId,
                elapsedMs: Date.now() - startedAt,
                connectionState: connection.state,
            }
        );
    });
    try {
        const resolvedHost = await client.host;
        const databricksWorkspaceId = connection.databricksWorkspace?.id;
        const {workspaceId, source: workspaceIdSource} =
            resolveWorkspaceId(connection);
        getLogger().info("[LanguageModelChat] Starting model discovery", {
            discoveryId,
            connectionState: connection.state,
            tokenIsCancellationRequested: token.isCancellationRequested,
            resolvedHost: resolvedHost.origin,
            configuredHost: client.config.host,
            targetUrl: new URL(
                "/api/2.1/unity-catalog/model-services",
                resolvedHost
            ).toString(),
            proxyEnv: proxyEnvSnapshot(),
            authType: client.config.authType,
            isUnifiedHost: client.config.experimentalIsUnifiedHost,
            hasDatabricksWorkspaceId:
                databricksWorkspaceId !== undefined &&
                databricksWorkspaceId !== "",
            hasApiClientWorkspaceId:
                client.config.workspaceId !== undefined &&
                client.config.workspaceId !== "",
            workspaceIdsMatch:
                databricksWorkspaceId !== undefined &&
                client.config.workspaceId !== undefined
                    ? databricksWorkspaceId === client.config.workspaceId
                    : undefined,
            workspaceIdSource,
        });
        const models = await listModelServices(
            client,
            workspaceId,
            token,
            discoveryId,
            fetcher
        );
        getLogger().info(
            `[LanguageModelChat] Discovered ${models.length} Unity Gateway model(s)`,
            {
                discoveryId,
                elapsedMs: Date.now() - startedAt,
                models: models.map((model) => model.id),
            }
        );
        return models.sort((left, right) =>
            left.name.localeCompare(right.name)
        );
    } catch (error) {
        getLogger().error("[LanguageModelChat] Model discovery request threw", {
            discoveryId,
            elapsedMs: Date.now() - startedAt,
            connectionState: connection.state,
            cancellationObserved,
            tokenIsCancellationRequested: token.isCancellationRequested,
            error: describeError(error),
        });
        throw error;
    } finally {
        cancellationListener.dispose();
    }
}

export async function requestUnityGateway(
    connection: LanguageModelChatConnection,
    payload: UnityGatewayRequestPayload,
    token: CancellationToken,
    onTextDelta?: (text: string) => void,
    fetcher: Fetch = fetch
): Promise<OpenAIChatCompletionResponse> {
    const client = connection.apiClient;
    if (client === undefined) {
        throw new Error("Databricks workspace API client is not available.");
    }
    const {toolChoice, maxTokens, ...requestPayload} = payload;
    const sendRequest = (disableReasoning: boolean) =>
        withCancellation(token, (signal) =>
            requestStreamingCompletion(
                client,
                resolveWorkspaceId(connection).workspaceId,
                {
                    ...requestPayload,
                    ...(disableReasoning ? {reasoning_effort: "none"} : {}),
                    ...(maxTokens === undefined ? {} : {max_tokens: maxTokens}),
                    ...(toolChoice === undefined
                        ? {}
                        : {tool_choice: toolChoice}),
                },
                signal,
                onTextDelta,
                fetcher
            )
        );
    const hasTools = Boolean(requestPayload.tools?.length);
    const useDisabledReasoning =
        hasTools && MODELS_REQUIRING_DISABLED_REASONING.has(payload.model);
    let message: OpenAIChatAssistantMessage;
    let textWasStreamed: boolean;
    try {
        ({message, textWasStreamed} = await sendRequest(useDisabledReasoning));
    } catch (error) {
        if (
            useDisabledReasoning ||
            !hasTools ||
            !requestsDisabledReasoning(error)
        ) {
            throw error;
        }
        ({message, textWasStreamed} = await sendRequest(true));
        MODELS_REQUIRING_DISABLED_REASONING.add(payload.model);
    }
    getLogger().info(
        `[LanguageModelChat] chat completions raw response: ${stringifyJson(
            message
        )}`
    );
    return {message, textWasStreamed};
}

async function requestStreamingCompletion(
    client: NonNullable<LanguageModelChatConnection["apiClient"]>,
    workspaceId: string | undefined,
    payload: Record<string, unknown>,
    signal: AbortSignal,
    onTextDelta: ((text: string) => void) | undefined,
    fetcher: Fetch
): Promise<{
    readonly message: OpenAIChatAssistantMessage;
    readonly textWasStreamed: boolean;
}> {
    const headers = workspaceHeaders(workspaceId, true);
    await client.config.authenticate(headers);
    const response = await fetcher(
        new URL("/ai-gateway/mlflow/v1/chat/completions", await client.host),
        {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            redirect: "manual",
            signal,
        }
    );
    if (!response.ok) {
        const body = await response.text();
        throw httpError(response.status, body);
    }
    if (response.body === null) {
        throw new Error(
            "Unity Gateway returned a chat completion without a response body."
        );
    }

    const message: Record<string, unknown> = {
        role: "assistant",
        content: null,
    };
    const toolCalls = new Map<number, Record<string, unknown>>();
    let textWasStreamed = false;
    let finished = false;

    try {
        for await (const data of readServerSentEvents(response.body, signal)) {
            if (data === "[DONE]") {
                finished = true;
                break;
            }
            let chunk: unknown;
            try {
                chunk = JSON.parse(data);
            } catch {
                throw new Error(
                    `Unity Gateway returned invalid streaming JSON: ${data}`
                );
            }
            const choice = firstStreamingChoice(chunk);
            if (choice === undefined) {
                const error = streamingError(chunk);
                if (error !== undefined) {
                    throw error;
                }
                continue;
            }
            const finishReason = choice["finish_reason"];
            finished ||= finishReason !== null && finishReason !== undefined;
            const delta = choice["delta"];
            if (!isRecord(delta)) {
                continue;
            }
            const emittedText = accumulateAssistantContent(
                message,
                delta,
                onTextDelta
            );
            textWasStreamed =
                textWasStreamed || (emittedText && onTextDelta !== undefined);
            accumulateAssistantFields(message, delta);
            const streamedToolCalls = delta["tool_calls"];
            if (
                streamedToolCalls !== undefined &&
                !Array.isArray(streamedToolCalls)
            ) {
                throw new Error(
                    "Unity Gateway returned invalid streamed tool calls."
                );
            }
            for (const toolCall of streamedToolCalls ?? []) {
                if (!isRecord(toolCall)) {
                    throw new Error(
                        "Unity Gateway returned an invalid streamed tool call."
                    );
                }
                accumulateToolCall(toolCalls, toolCall);
            }
        }
    } catch (error) {
        if (signal.aborted) {
            throw cancellationError();
        }
        throw error;
    }

    if (signal.aborted) {
        throw cancellationError();
    }
    if (!finished) {
        throw new Error(
            "Unity Gateway ended the chat completion stream before it finished."
        );
    }
    if (toolCalls.size > 0) {
        message["tool_calls"] = [...toolCalls.entries()]
            .sort(([left], [right]) => left - right)
            .map(([index, toolCall]) => finalizeToolCall(index, toolCall));
    }
    if (!isOpenAIChatAssistantMessage(message)) {
        throw new Error(
            "Unity Gateway returned a chat completion without an assistant message."
        );
    }
    return {message, textWasStreamed};
}

function accumulateAssistantContent(
    message: Record<string, unknown>,
    delta: Record<string, unknown>,
    onTextDelta?: (text: string) => void
): boolean {
    const content = delta["content"];
    if (typeof content === "string") {
        if (content === "") {
            return false;
        }
        message["content"] = Array.isArray(message["content"])
            ? [...message["content"], {type: "text", text: content}]
            : (typeof message["content"] === "string"
                  ? message["content"]
                  : "") + content;
        onTextDelta?.(content);
        return true;
    }
    if (!Array.isArray(content)) {
        return false;
    }
    const existingContent = Array.isArray(message["content"])
        ? message["content"]
        : typeof message["content"] === "string"
          ? [{type: "text", text: message["content"]}]
          : [];
    message["content"] = [...existingContent, ...content];
    let emittedText = false;
    for (const part of content) {
        if (
            typeof part === "object" &&
            part !== null &&
            ((part as {type?: unknown}).type === "text" ||
                (part as {type?: unknown}).type === "output_text") &&
            typeof (part as {text?: unknown}).text === "string" &&
            (part as {text: string}).text !== ""
        ) {
            onTextDelta?.((part as {text: string}).text);
            emittedText = true;
        }
    }
    return emittedText;
}

function accumulateAssistantFields(
    message: Record<string, unknown>,
    delta: Record<string, unknown>
): void {
    for (const [key, value] of Object.entries(delta)) {
        if (
            key === "role" ||
            key === "content" ||
            key === "tool_calls" ||
            value === undefined
        ) {
            continue;
        }
        message[key] = mergeStreamingValue(message[key], value);
    }
}

function accumulateToolCall(
    toolCalls: Map<number, Record<string, unknown>>,
    delta: Record<string, unknown>
): void {
    const index = delta["index"];
    if (
        typeof index !== "number" ||
        !Number.isSafeInteger(index) ||
        index < 0
    ) {
        throw new Error(
            `Unity Gateway returned an invalid streamed tool call index: ${index}.`
        );
    }
    const {id, type, function: functionDelta, ...extra} = delta;
    delete extra["index"];
    const toolCall = toolCalls.get(index) ?? {};
    for (const [key, value] of Object.entries(extra)) {
        toolCall[key] = mergeStreamingValue(toolCall[key], value);
    }
    if (id !== undefined) {
        toolCall["id"] = id;
    }
    if (type !== undefined) {
        toolCall["type"] = type;
    }
    if (functionDelta !== undefined && !isRecord(functionDelta)) {
        throw new Error(
            `Unity Gateway returned an invalid function call at index ${index}.`
        );
    }
    if (functionDelta !== undefined) {
        const existingFunction =
            typeof toolCall["function"] === "object" &&
            toolCall["function"] !== null
                ? (toolCall["function"] as Record<string, unknown>)
                : {};
        for (const [key, value] of Object.entries(functionDelta)) {
            if (key !== "name" && key !== "arguments" && value !== undefined) {
                existingFunction[key] = mergeStreamingValue(
                    existingFunction[key],
                    value
                );
            }
        }
        if (functionDelta.name !== undefined) {
            existingFunction["name"] = functionDelta.name;
        }
        if (
            functionDelta.arguments !== undefined &&
            typeof functionDelta.arguments !== "string"
        ) {
            throw new Error(
                `Unity Gateway returned invalid function arguments at index ${index}.`
            );
        }
        if (typeof functionDelta.arguments === "string") {
            existingFunction["arguments"] =
                (typeof existingFunction["arguments"] === "string"
                    ? existingFunction["arguments"]
                    : "") + functionDelta.arguments;
        }
        toolCall["function"] = existingFunction;
    }
    toolCalls.set(index, toolCall);
}

function finalizeToolCall(
    index: number,
    toolCall: Record<string, unknown>
): OpenAIChatToolCall {
    const functionCall = toolCall["function"];
    if (
        typeof toolCall["id"] !== "string" ||
        toolCall["type"] !== "function" ||
        typeof functionCall !== "object" ||
        functionCall === null ||
        typeof (functionCall as Record<string, unknown>)["name"] !== "string" ||
        typeof (functionCall as Record<string, unknown>)["arguments"] !==
            "string"
    ) {
        throw new Error(
            `Unity Gateway returned an incomplete streamed tool call at index ${index}.`
        );
    }
    return toolCall as OpenAIChatToolCall;
}

function mergeStreamingValue(current: unknown, next: unknown): unknown {
    if (typeof current === "string" && typeof next === "string") {
        return current + next;
    }
    if (
        typeof current === "object" &&
        current !== null &&
        !Array.isArray(current) &&
        typeof next === "object" &&
        next !== null &&
        !Array.isArray(next)
    ) {
        return {...current, ...next};
    }
    return next;
}

async function* readServerSentEvents(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal
): AsyncGenerator<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
        while (!signal.aborted) {
            const {done, value} = await reader.read();
            buffer += decoder.decode(value, {stream: !done});
            let boundary = eventBoundary(buffer);
            while (boundary !== undefined) {
                const event = buffer.slice(0, boundary.index);
                buffer = buffer.slice(boundary.index + boundary.length);
                const data = eventData(event);
                if (data !== undefined) {
                    yield data;
                }
                boundary = eventBoundary(buffer);
            }
            if (done) {
                const data = eventData(buffer);
                if (data !== undefined) {
                    yield data;
                }
                break;
            }
        }
    } finally {
        try {
            await reader.cancel();
        } catch {
            // The body may already be closed or aborted.
        }
        try {
            reader.releaseLock();
        } catch {
            // cancel() already released the lock.
        }
    }
}

function eventBoundary(
    value: string
): {readonly index: number; readonly length: number} | undefined {
    const match = /\r\n\r\n|\n\n|\r\r/.exec(value);
    return match === null
        ? undefined
        : {index: match.index, length: match[0].length};
}

function eventData(event: string): string | undefined {
    const lines = event.split(/\r\n|\r|\n/);
    const data: string[] = [];
    for (const line of lines) {
        if (line === "data") {
            data.push("");
        } else if (line.startsWith("data:")) {
            const value = line.slice(5);
            data.push(value.startsWith(" ") ? value.slice(1) : value);
        }
    }
    return data.length === 0 ? undefined : data.join("\n");
}

function firstStreamingChoice(
    value: unknown
): Record<string, unknown> | undefined {
    if (!isRecord(value) || !Array.isArray(value["choices"])) {
        return undefined;
    }
    const choices = value["choices"].filter(isRecord);
    return choices.find((choice) => choice["index"] === 0) ?? choices[0];
}

function streamingError(value: unknown): Error | undefined {
    if (!isRecord(value) || value["error"] === undefined) {
        return undefined;
    }
    const error = value["error"];
    const message =
        isRecord(error) && typeof error["message"] === "string"
            ? error["message"]
            : typeof error === "string"
              ? error
              : stringifyJson(error);
    return new Error(`Unity Gateway streaming error: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function httpError(status: number, body: string): Error {
    return Object.assign(
        new Error(`Databricks returned HTTP ${status}: ${body}`),
        {status, statusCode: status, body}
    );
}

function cancellationError(): Error {
    return Object.assign(new Error("The chat completion was cancelled."), {
        name: "AbortError",
    });
}

async function withCancellation<T>(
    token: CancellationToken,
    request: (signal: AbortSignal) => Promise<T>
): Promise<T> {
    const controller = new AbortController();
    if (token.isCancellationRequested) {
        controller.abort();
    }
    const cancellationListener = token.onCancellationRequested(() =>
        controller.abort()
    );
    try {
        return await request(controller.signal);
    } finally {
        cancellationListener.dispose();
    }
}

function requestsDisabledReasoning(error: unknown): boolean {
    if (typeof error !== "object" || error === null) {
        return false;
    }
    const record = error as {status?: unknown; message?: unknown};
    if (record.status !== 400 || typeof record.message !== "string") {
        return false;
    }
    return (
        record.message.includes(
            "Function tools with reasoning_effort are not supported"
        ) && record.message.includes("set reasoning_effort to 'none'")
    );
}

interface ModelService {
    readonly name?: string;
    readonly comment?: string;
    readonly supported_api_types?: readonly string[];
}

interface ListModelServicesResponse {
    readonly model_services?: readonly ModelService[];
    readonly next_page_token?: string;
}

async function listModelServices(
    client: NonNullable<LanguageModelChatConnection["apiClient"]>,
    workspaceId: string | undefined,
    token: CancellationToken,
    discoveryId: number,
    fetcher: Fetch
): Promise<LanguageModelChatInformation[]> {
    const parent = "schemas/system.ai";
    const models: LanguageModelChatInformation[] = [];
    let pageToken: string | undefined;
    let pageNumber = 1;
    do {
        getLogger().info("[LanguageModelChat] Requesting model-services page", {
            discoveryId,
            parent,
            pageNumber,
            hasPageToken: pageToken !== undefined,
            hasWorkspaceId: workspaceId !== undefined && workspaceId !== "",
            tokenIsCancellationRequested: token.isCancellationRequested,
            path: "/api/2.1/unity-catalog/model-services",
            query: {
                parent,
                page_size: 100,
                view: "BASIC",
                page_token: pageToken,
            },
        });
        const requestStartedAt = Date.now();
        let response: ListModelServicesResponse;
        try {
            response = asListModelServicesResponse(
                await fetchJson(
                    client,
                    "/api/2.1/unity-catalog/model-services",
                    {
                        method: "GET",
                        headers: workspaceHeaders(workspaceId),
                        query: {
                            parent,
                            page_size: 100,
                            view: "BASIC",
                            page_token: pageToken,
                        },
                    },
                    token,
                    fetcher
                )
            );
        } catch (error) {
            getLogger().error(
                "[LanguageModelChat] model-services request failed at the transport level",
                {
                    discoveryId,
                    pageNumber,
                    requestElapsedMs: Date.now() - requestStartedAt,
                    method: "GET",
                    path: "/api/2.1/unity-catalog/model-services",
                    query: {
                        parent,
                        page_size: 100,
                        view: "BASIC",
                        page_token: pageToken,
                    },
                    tokenIsCancellationRequested: token.isCancellationRequested,
                    error: describeError(error),
                }
            );
            throw error;
        }
        const services = response.model_services ?? [];
        getLogger().info(
            `[LanguageModelChat] model-services raw response: ${stringifyJson(
                response
            )}`,
            {
                discoveryId,
                parent,
                pageNumber,
                responseType: typeof response,
                responseConstructor: response.constructor?.name,
                responseKeys: Object.keys(response),
                serviceCount: services.length,
                hasNextPageToken:
                    response.next_page_token !== undefined &&
                    response.next_page_token !== "",
            }
        );
        for (const service of services) {
            const supportedApiTypes = (service.supported_api_types ?? []).map(
                (type) => type.toLowerCase()
            );
            if (
                supportedApiTypes.length > 0 &&
                !supportedApiTypes.some(
                    (type) =>
                        type === "chat" || type.endsWith("/chat/completions")
                )
            ) {
                getLogger().info(
                    "[LanguageModelChat] Skipping non-chat model service",
                    {
                        discoveryId,
                        pageNumber,
                        name: service.name,
                        supportedApiTypes,
                    }
                );
                continue;
            }
            const id = service.name?.replace(/^model-services\//, "");
            if (id === undefined || id === "") {
                getLogger().info(
                    "[LanguageModelChat] Skipping unnamed model service",
                    {
                        discoveryId,
                        pageNumber,
                        name: service.name,
                    }
                );
                continue;
            }
            models.push({
                id,
                name: displayNameForModelId(id),
                family: id.split(".").at(-1) ?? id,
                version: "1",
                maxInputTokens: 128_000, // TODO: get from model service - shouldnt be a hardcoded limit
                maxOutputTokens: 4_096,
                tooltip: service.comment,
                detail: "Databricks",
                capabilities: {
                    imageInput: false,
                    toolCalling: true,
                },
            });
            getLogger().info(
                "[LanguageModelChat] Added compatible model service",
                {
                    discoveryId,
                    pageNumber,
                    id,
                    supportedApiTypes,
                }
            );
        }
        pageToken = response.next_page_token;
        pageNumber++;
    } while (pageToken !== undefined && pageToken !== "");
    getLogger().info(
        `[LanguageModelChat] model-services returned ${models.length} compatible service(s)`,
        {discoveryId, parent, models: models.map((model) => model.id)}
    );
    return models;
}

async function fetchJson(
    client: NonNullable<LanguageModelChatConnection["apiClient"]>,
    path: string,
    options: {
        readonly method: "GET" | "POST";
        readonly headers: Headers;
        readonly query?: Record<string, string | number | undefined>;
        readonly payload?: unknown;
    },
    token: CancellationToken,
    fetcher: Fetch
): Promise<unknown> {
    const url = new URL(path, await client.host);
    for (const [key, value] of Object.entries(options.query ?? {})) {
        if (value !== undefined) {
            url.searchParams.set(key, String(value));
        }
    }
    await client.config.authenticate(options.headers);
    const controller = new AbortController();
    const cancellationListener = token.onCancellationRequested(() =>
        controller.abort()
    );
    try {
        const response = await fetcher(url, {
            method: options.method,
            headers: options.headers,
            body:
                options.payload === undefined
                    ? undefined
                    : JSON.stringify(options.payload),
            redirect: "manual",
            signal: controller.signal,
        });
        const body = await response.text();
        if (!response.ok) {
            throw Object.assign(
                new Error(
                    `Databricks returned HTTP ${response.status}: ${body}`
                ),
                {status: response.status, statusCode: response.status}
            );
        }
        try {
            return body === "" ? {} : JSON.parse(body);
        } catch {
            throw new Error(`Databricks returned invalid JSON: ${body}`);
        }
    } finally {
        cancellationListener.dispose();
    }
}

function workspaceHeaders(
    workspaceId: string | undefined,
    json = false
): Headers {
    const headers = new Headers();
    if (workspaceId !== undefined && workspaceId !== "") {
        headers.set(WORKSPACE_ID_HEADER, workspaceId);
    }
    if (json) {
        headers.set("Content-Type", "application/json");
    }
    return headers;
}

function displayNameForModelId(id: string): string {
    return id.replace(/^system\.ai\./, "");
}

function resolveWorkspaceId(connection: LanguageModelChatConnection): {
    readonly workspaceId: string | undefined;
    readonly source: "databricksWorkspace" | "apiClientConfig" | "none";
} {
    const databricksWorkspaceId = connection.databricksWorkspace?.id;
    if (databricksWorkspaceId !== undefined && databricksWorkspaceId !== "") {
        return {
            workspaceId: databricksWorkspaceId,
            source: "databricksWorkspace",
        };
    }
    const apiClientWorkspaceId = connection.apiClient?.config.workspaceId;
    if (apiClientWorkspaceId !== undefined && apiClientWorkspaceId !== "") {
        return {
            workspaceId: apiClientWorkspaceId,
            source: "apiClientConfig",
        };
    }
    return {workspaceId: undefined, source: "none"};
}

function asListModelServicesResponse(
    value: unknown
): ListModelServicesResponse {
    if (typeof value !== "object" || value === null) {
        throw new Error("Unity Gateway returned an invalid model list.");
    }
    return value as ListModelServicesResponse;
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

function stringifyJson(value: unknown): string {
    try {
        return JSON.stringify(value);
    } catch (error) {
        return `[unserializable: ${
            error instanceof Error ? error.message : String(error)
        }]`;
    }
}

const REDACTED_ERROR_PROPERTIES = new Set(["token", "authorization", "config"]);

/**
 * Serialise an error with every own enumerable property (so non-standard fields
 * like `response`, `errno`, `info`, `reason` survive), plus the prototype
 * `name`/`message`/`stack`, and recurse through the `cause` chain. A socket
 * `ECONNRESET`/"aborted" carries its real detail in these extra fields, which a
 * fixed allow-list would drop.
 */
function describeError(error: unknown, depth = 0): unknown {
    if (typeof error !== "object" || error === null) {
        return error;
    }
    const record = error as Record<string, unknown> & {
        name?: unknown;
        message?: unknown;
        stack?: unknown;
        cause?: unknown;
    };
    const described: Record<string, unknown> = {
        type: error.constructor?.name,
        name: record.name,
        message: record.message,
        stack: record.stack,
    };
    for (const key of Object.getOwnPropertyNames(error)) {
        if (key === "cause" || key in described) {
            continue;
        }
        described[key] = REDACTED_ERROR_PROPERTIES.has(key.toLowerCase())
            ? "[redacted]"
            : (record[key] as unknown);
    }
    if (record.cause !== undefined) {
        described["cause"] =
            depth < 4 ? describeError(record.cause, depth + 1) : "[max depth]";
    }
    return described;
}

/** Names of proxy-related env vars that are set, without their values. */
function proxyEnvSnapshot(): Record<string, boolean> {
    const names = [
        "HTTP_PROXY",
        "http_proxy",
        "HTTPS_PROXY",
        "https_proxy",
        "NO_PROXY",
        "no_proxy",
        "DATABRICKS_SDK_PROXY_STRICT_SSL",
    ];
    const snapshot: Record<string, boolean> = {};
    for (const name of names) {
        snapshot[name] =
            process.env[name] !== undefined && process.env[name] !== "";
    }
    return snapshot;
}

function getLogger() {
    return logging.NamedLogger.getOrCreate(Loggers.Extension);
}
