/**
 * VS Code Language Model Chat API shim.
 *
 * `vscode.lm.registerLanguageModelChatProvider` and the LanguageModel*Part
 * constructors exist only from VS Code 1.104. This module is the only place
 * that touches those APIs so the rest of lm-chat can compile and unit-test
 * against older `@types/vscode` and still no-op on hosts that lack the
 * runtime. It does not talk to Databricks.
 */
/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import type {Disposable} from "vscode";
import type {
    LanguageModelChatProvider,
    LanguageModelDataPart,
    LanguageModelTextPart,
    LanguageModelToolCallPart,
    LanguageModelToolResultPart,
    OpenAIChatAssistantMessage,
} from "./types";

export const RAW_ASSISTANT_MESSAGE_MIME =
    "application/vnd.databricks.language-model-chat-message+json";

interface LanguageModelChatProviderApi {
    readonly lm?: {
        registerLanguageModelChatProvider?(
            vendor: string,
            provider: LanguageModelChatProvider
        ): Disposable;
    };
    readonly LanguageModelTextPart?: new (
        value: string
    ) => LanguageModelTextPart;
    readonly LanguageModelDataPart?: {
        new (data: Uint8Array, mimeType: string): LanguageModelDataPart;
        json(value: unknown, mimeType?: string): LanguageModelDataPart;
    };
    readonly LanguageModelToolCallPart?: new (
        callId: string,
        name: string,
        input: object
    ) => LanguageModelToolCallPart;
    readonly LanguageModelToolResultPart?: new (
        callId: string,
        content: ReadonlyArray<unknown>
    ) => LanguageModelToolResultPart;
    readonly LanguageModelChatToolMode?: {
        readonly Required: unknown;
    };
    readonly LanguageModelError?: {
        NoPermissions(message?: string): Error;
        NotFound(message?: string): Error;
    };
}

export function registerLanguageModelChatProvider(
    vendor: string,
    provider: LanguageModelChatProvider
): Disposable | undefined {
    return getLanguageModelChatProviderApi().lm?.registerLanguageModelChatProvider?.(
        vendor,
        provider
    );
}

export function createLanguageModelTextPart(
    value: string
): LanguageModelTextPart {
    const constructor = getLanguageModelChatProviderApi().LanguageModelTextPart;
    if (constructor === undefined) {
        throw new Error(
            "Language model chat providers require VS Code 1.104 or later."
        );
    }
    return new constructor(value);
}

export function createLanguageModelDataPart(
    value: OpenAIChatAssistantMessage
): LanguageModelDataPart {
    const constructor = getLanguageModelChatProviderApi().LanguageModelDataPart;
    if (constructor === undefined) {
        throw new Error(
            "Language model data parts require VS Code 1.104 or later."
        );
    }
    return constructor.json(value, RAW_ASSISTANT_MESSAGE_MIME);
}

export function createLanguageModelToolCallPart(
    callId: string,
    name: string,
    input: object
): LanguageModelToolCallPart {
    const constructor =
        getLanguageModelChatProviderApi().LanguageModelToolCallPart;
    if (constructor === undefined) {
        throw new Error(
            "Language model tool calling requires VS Code 1.104 or later."
        );
    }
    return new constructor(callId, name, input);
}

export function createLanguageModelError(
    code: "NoPermissions" | "NotFound",
    message: string
): Error {
    const factory =
        getLanguageModelChatProviderApi().LanguageModelError?.[code];
    return factory?.(message) ?? Object.assign(new Error(message), {code});
}

export function isRequiredToolMode(toolMode: unknown): boolean {
    const required =
        getLanguageModelChatProviderApi().LanguageModelChatToolMode?.Required;
    return required !== undefined && toolMode === required;
}

export function isLanguageModelTextPart(
    part: unknown
): part is LanguageModelTextPart {
    const constructor = getLanguageModelChatProviderApi().LanguageModelTextPart;
    return (
        (constructor !== undefined && part instanceof constructor) ||
        (typeof part === "object" &&
            part !== null &&
            typeof (part as LanguageModelTextPart).value === "string")
    );
}

export function isLanguageModelDataPart(
    part: unknown
): part is LanguageModelDataPart {
    const constructor = getLanguageModelChatProviderApi().LanguageModelDataPart;
    return (
        (constructor !== undefined && part instanceof constructor) ||
        (typeof part === "object" &&
            part !== null &&
            typeof (part as LanguageModelDataPart).mimeType === "string" &&
            (part as LanguageModelDataPart).data instanceof Uint8Array)
    );
}

export function isLanguageModelToolCallPart(
    part: unknown
): part is LanguageModelToolCallPart {
    const constructor =
        getLanguageModelChatProviderApi().LanguageModelToolCallPart;
    return (
        (constructor !== undefined && part instanceof constructor) ||
        (typeof part === "object" &&
            part !== null &&
            typeof (part as LanguageModelToolCallPart).callId === "string" &&
            typeof (part as LanguageModelToolCallPart).name === "string" &&
            "input" in part)
    );
}

export function isLanguageModelToolResultPart(
    part: unknown
): part is LanguageModelToolResultPart {
    const constructor =
        getLanguageModelChatProviderApi().LanguageModelToolResultPart;
    return (
        (constructor !== undefined && part instanceof constructor) ||
        (typeof part === "object" &&
            part !== null &&
            typeof (part as LanguageModelToolResultPart).callId === "string" &&
            Array.isArray((part as LanguageModelToolResultPart).content))
    );
}

/** Cast because `@types/vscode` may not declare these 1.104+ members. */
function getLanguageModelChatProviderApi(): LanguageModelChatProviderApi {
    return vscode as typeof vscode & LanguageModelChatProviderApi;
}
