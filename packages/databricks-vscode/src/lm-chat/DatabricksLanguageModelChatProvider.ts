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
            throw createLanguageModelError(
                "NoPermissions",
                "Sign in to a Databricks workspace before using this model."
            );
        }
        if (this.connection.apiClient === undefined) {
            throw createLanguageModelError(
                "NoPermissions",
                "Databricks workspace authentication is not available."
            );
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
            if (status === 401 || status === 403) {
                throw createLanguageModelError(
                    "NoPermissions",
                    "Databricks rejected the credentials for this language model."
                );
            }
            if (status === 404) {
                throw createLanguageModelError(
                    "NotFound",
                    `The Unity Gateway model '${model.id}' was not found.`
                );
            }
            if (status === 400) {
                throw new Error(
                    `The Unity Gateway model '${model.id}' rejected this chat request. ` +
                        `It may not support one of the requested chat features. ` +
                        errorDetail(error)
                );
            }
            throw error;
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

function errorDetail(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
