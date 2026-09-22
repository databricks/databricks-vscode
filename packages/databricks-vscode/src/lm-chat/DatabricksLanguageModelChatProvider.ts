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
    private readonly connectionListener: Disposable;
    private readonly opaqueAssistantState = new OpaqueAssistantStateStore();
    private modelInformation?: LanguageModelChatInformation[];

    readonly onDidChangeLanguageModelChatInformation =
        this.onDidChangeEmitter.event;

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
                    stream: false,
                    ...toOpenAIChatToolOptions(
                        options,
                        model.capabilities.toolCalling
                    ),
                },
                token
            );

            const parts = toLanguageModelResponseParts(
                body,
                this.opaqueAssistantState
            );
            if (parts.length === 0) {
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
