import {
    CancellationError,
    CancellationToken,
    Disposable,
    EventEmitter,
    Progress,
} from "vscode";
import {logging} from "@databricks/sdk-experimental";
import {Loggers} from "../logger";
import {HostUtils} from "../utils";
import {
    toLanguageModelResponseParts,
    toOpenAIChatMessages,
    toOpenAIChatToolOptions,
} from "./languageModelChatConversion";
import {OpaqueAssistantStateStore} from "./OpaqueAssistantStateStore";
import {
    discoverUnityGatewayModels,
    requestUnityGateway,
} from "./UnityGatewayClient";
import {
    createLanguageModelError,
    createLanguageModelTextPart,
    isLanguageModelTextPart,
    registerLanguageModelChatProvider,
} from "./vscodeLanguageModelChat";
import type {
    LanguageModelChatConnection,
    LanguageModelChatInformation,
    LanguageModelChatProvider,
    LanguageModelChatRequestMessage,
    LanguageModelResponsePart,
    LanguageModelTextPart,
    PrepareLanguageModelChatModelOptions,
    ProvideLanguageModelChatResponseOptions,
    UnityGatewayModelDiscovery,
    UnityGatewayRequest,
} from "./types";

const DATABRICKS_LANGUAGE_MODEL_VENDOR = "databricks";

// Shown as assistant text (not thrown) when a model cannot satisfy the tool
// calling configuration Chat requires. Reporting text avoids the stack trace
// Chat renders for any thrown error.
const UNUSABLE_MODEL_FOR_TOOLS =
    "This model cannot use the tools required by Chat. Choose another Databricks model.";
const UNUSABLE_MODEL_FOR_CHAT_API =
    "This model is not supported in Databricks Chat yet. Choose another Databricks model.";
const SIGN_IN_REQUIRED = "Sign in to Databricks to use this model.";
const MODEL_ACCESS_DENIED = "You do not have access to this model.";
const MODEL_NOT_AVAILABLE =
    "This model is no longer available. Choose another Databricks model.";
const REQUEST_RATE_LIMITED =
    "Databricks rate-limited this request. Try again in a moment.";
const UNSUPPORTED_REQUEST =
    "This model could not complete the request. Try another Databricks model.";
const SERVICE_UNAVAILABLE =
    "Databricks is temporarily unavailable. Try again later.";
const REQUEST_FAILED =
    "Databricks could not complete this request. Try again or choose another model.";

export class DatabricksLanguageModelChatProvider
    implements Disposable, LanguageModelChatProvider
{
    private readonly onDidChangeEmitter = new EventEmitter<void>();
    private readonly onDidDiscoverModelsEmitter = new EventEmitter<number>();
    private readonly onDidRequestSignInEmitter = new EventEmitter<void>();
    private readonly connectionListener: Disposable;
    private readonly opaqueAssistantState = new OpaqueAssistantStateStore();
    private modelInformation?: LanguageModelChatInformation[];
    private signInPromptRequested = false;

    readonly onDidChangeLanguageModelChatInformation =
        this.onDidChangeEmitter.event;

    // Fires with the model count after a fresh discovery populates the model
    // list. Consumers surface UI (for example a notification); this class keeps
    // window.* concerns out.
    readonly onDidDiscoverModels = this.onDidDiscoverModelsEmitter.event;

    // Fires once when a background (silent) discovery finds the user signed out,
    // so a consumer can prompt them to authenticate. Kept UI-free here.
    readonly onDidRequestSignIn = this.onDidRequestSignInEmitter.event;

    constructor(
        private readonly connection: LanguageModelChatConnection,
        private readonly request: UnityGatewayRequest = requestUnityGateway,
        private readonly discover: UnityGatewayModelDiscovery = discoverUnityGatewayModels
    ) {
        this.connectionListener = connection.onDidChangeState(() => {
            this.modelInformation = undefined;
            this.onDidChangeEmitter.fire();
        });
    }

    async provideLanguageModelChatInformation(
        options: PrepareLanguageModelChatModelOptions,
        token: CancellationToken
    ): Promise<LanguageModelChatInformation[]> {
        this.throwIfCancelled(token);
        try {
            await this.connection.ensureConnected?.(!options.silent, token);
            this.throwIfCancelled(token);
            if (this.connection.state !== "CONNECTED") {
                if (
                    options.silent &&
                    this.connection.state === "DISCONNECTED" &&
                    !this.signInPromptRequested
                ) {
                    this.signInPromptRequested = true;
                    this.onDidRequestSignInEmitter.fire();
                }
                return [];
            }
            if (this.modelInformation !== undefined) {
                return this.modelInformation;
            }
            const modelInformation = await this.discover(
                this.connection,
                token
            );
            this.throwIfCancelled(token);
            this.modelInformation = modelInformation;
            if (modelInformation.length > 0) {
                this.onDidDiscoverModelsEmitter.fire(modelInformation.length);
            }
            return modelInformation;
        } catch (error) {
            if (token.isCancellationRequested) {
                throw new CancellationError();
            }
            const status = httpStatus(error);
            if (status === 401 || status === 403) {
                throw createLanguageModelError(
                    "NoPermissions",
                    "Databricks rejected the credentials for model discovery."
                );
            }
            logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                "[LanguageModelChat] Model discovery failed",
                error
            );
            return [];
        }
    }

    async provideLanguageModelChatResponse(
        model: LanguageModelChatInformation,
        messages: readonly LanguageModelChatRequestMessage[],
        options: ProvideLanguageModelChatResponseOptions,
        progress: Progress<LanguageModelResponsePart>,
        token: CancellationToken
    ): Promise<void> {
        this.throwIfCancelled(token); // TODO can we add a button/ link
        if (this.connection.state !== "CONNECTED") {
            progress.report(createLanguageModelTextPart(SIGN_IN_REQUIRED));
            return;
        }
        if (this.connection.apiClient === undefined) {
            progress.report(createLanguageModelTextPart(SIGN_IN_REQUIRED));
            return;
        }

        try {
            const body = await this.request(
                this.connection,
                {
                    model: model.id,
                    messages: toOpenAIChatMessages(
                        messages,
                        this.opaqueAssistantState
                    ),
                    maxTokens: model.maxOutputTokens,
                    stream: true,
                    ...toOpenAIChatToolOptions(
                        options,
                        model.capabilities.toolCalling
                    ),
                },
                token,
                (text) => progress.report(createLanguageModelTextPart(text))
            );

            const parts = toLanguageModelResponseParts(
                body,
                this.opaqueAssistantState
            ).filter(
                (part) =>
                    !body.textWasStreamed || !isLanguageModelTextPart(part)
            );
            if (parts.length === 0 && !body.textWasStreamed) {
                throw new Error(
                    "Unity Gateway returned a response without text or tool calls."
                );
            }
            for (const part of parts) {
                progress.report(part);
            }
        } catch (error) {
            if (token.isCancellationRequested) {
                throw new CancellationError();
            }
            const status = httpStatus(error);
            const logger = logging.NamedLogger.getOrCreate(Loggers.Extension);
            if (status === undefined) {
                logger.error(
                    "[LanguageModelChat] Chat request failed unexpectedly",
                    error
                );
            } else {
                logger.warn("[LanguageModelChat] Chat request rejected", {
                    status,
                    detail: gatewayErrorMessage(error),
                });
            }
            if (status === 401) {
                progress.report(createLanguageModelTextPart(SIGN_IN_REQUIRED));
                return;
            }
            if (status === 403) {
                progress.report(
                    createLanguageModelTextPart(MODEL_ACCESS_DENIED)
                );
                return;
            }
            if (status === 404) {
                progress.report(
                    createLanguageModelTextPart(MODEL_NOT_AVAILABLE)
                );
                return;
            }
            if (status === 429) {
                progress.report(
                    createLanguageModelTextPart(REQUEST_RATE_LIMITED)
                );
                return;
            }
            if (status === 400) {
                if (rejectsDisabledReasoning(error)) {
                    // A model that refuses reasoning_effort 'none' cannot satisfy
                    // the tool calling Chat always requests, so it is unusable
                    // here. Any thrown error (even a LanguageModelError) is
                    // surfaced by Chat with a stack trace, so report the reason
                    // as normal assistant text and end the turn cleanly instead.
                    progress.report(
                        createLanguageModelTextPart(UNUSABLE_MODEL_FOR_TOOLS)
                    );
                    return;
                }
                if (requiresResponsesApi(error)) {
                    // Some models are served via the Responses API only and are
                    // currently incompatible with this Chat transport.
                    progress.report(
                        createLanguageModelTextPart(UNUSABLE_MODEL_FOR_CHAT_API)
                    );
                    return;
                }
                progress.report(
                    createLanguageModelTextPart(UNSUPPORTED_REQUEST)
                );
                return;
            }
            if (status !== undefined && status >= 500) {
                progress.report(
                    createLanguageModelTextPart(SERVICE_UNAVAILABLE)
                );
                return;
            }
            progress.report(createLanguageModelTextPart(REQUEST_FAILED));
        }
    }

    async provideTokenCount(
        _model: LanguageModelChatInformation,
        text: string | LanguageModelChatRequestMessage,
        token: CancellationToken
    ): Promise<number> {
        this.throwIfCancelled(token);
        const value =
            typeof text === "string"
                ? text
                : text.content
                      .filter((part): part is LanguageModelTextPart =>
                          isLanguageModelTextPart(part)
                      )
                      .map((part) => part.value)
                      .join("");
        return Math.ceil(value.length / 4);
    }

    dispose(): void {
        this.connectionListener.dispose();
        this.onDidChangeEmitter.dispose();
        this.onDidDiscoverModelsEmitter.dispose();
        this.onDidRequestSignInEmitter.dispose();
    }

    private throwIfCancelled(token: CancellationToken): void {
        if (token.isCancellationRequested) {
            throw new CancellationError();
        }
    }
}

export function registerDatabricksLanguageModelChatProvider(
    provider: DatabricksLanguageModelChatProvider
): Disposable | undefined {
    if (HostUtils.isCursor()) {
        return undefined;
    }
    return registerLanguageModelChatProvider(
        DATABRICKS_LANGUAGE_MODEL_VENDOR,
        provider
    );
}

function httpStatus(error: unknown): number | undefined {
    if (typeof error !== "object" || error === null) {
        return undefined;
    }
    const value = error as {status?: unknown; statusCode?: unknown};
    if (typeof value.status === "number") {
        return value.status;
    }
    return typeof value.statusCode === "number" ? value.statusCode : undefined;
}

function gatewayErrorMessage(error: unknown): string | undefined {
    return gatewayErrorDetail(error)?.message;
}

interface GatewayErrorDetail {
    readonly message?: string;
    readonly code?: string;
    readonly param?: string;
}

function gatewayErrorDetail(error: unknown): GatewayErrorDetail | undefined {
    if (typeof error === "object" && error !== null) {
        const body = (error as {body?: unknown}).body;
        if (typeof body === "string") {
            return errorDetailFromValue(body);
        }
    }
    if (!(error instanceof Error)) {
        return undefined;
    }
    const httpMessage = /^Databricks returned HTTP \d+:\s*([\s\S]*)$/.exec(
        error.message
    );
    if (httpMessage !== null) {
        return errorDetailFromValue(httpMessage[1]);
    }
    const message = error.message.trim();
    return errorDetailFromValue(message.split(/\s*:\s*Error:\s*/, 1)[0]);
}

function rejectsDisabledReasoning(error: unknown): boolean {
    return gatewayErrorDetail(error)?.param === "reasoning_effort";
}

function requiresResponsesApi(error: unknown): boolean {
    const detail = gatewayErrorMessage(error);
    return (
        detail !== undefined &&
        detail.toLowerCase().includes("only supports the responses api")
    );
}

function errorDetailFromValue(value: unknown): GatewayErrorDetail | undefined {
    if (typeof value === "string") {
        const message = value.trim();
        if (message === "") {
            return undefined;
        }
        try {
            return errorDetailFromValue(JSON.parse(message)) ?? {message};
        } catch {
            return {message};
        }
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return undefined;
    }
    const record = value as Record<string, unknown>;
    const nested =
        errorDetailFromValue(record["error"]) ??
        errorDetailFromValue(record["message"]);
    const message =
        nested?.message ??
        (typeof record["message"] === "string"
            ? record["message"].trim() || undefined
            : undefined);
    const code =
        nested?.code ??
        (typeof record["code"] === "string"
            ? record["code"]
            : typeof record["error_code"] === "string"
              ? record["error_code"]
              : undefined);
    const param =
        nested?.param ??
        (typeof record["param"] === "string" ? record["param"] : undefined);
    if (message === undefined && code === undefined && param === undefined) {
        return undefined;
    }
    return {message, code, param};
}
