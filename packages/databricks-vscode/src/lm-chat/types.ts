/* eslint-disable @typescript-eslint/naming-convention */
import type {CancellationToken, Event, Progress} from "vscode";
import type {ApiClient} from "@databricks/sdk-experimental";
import type {ConnectionState} from "../configuration/ConnectionManager";

export interface LanguageModelChatInformation {
    readonly id: string;
    readonly name: string;
    readonly family: string;
    readonly version: string;
    readonly maxInputTokens: number;
    readonly maxOutputTokens: number;
    readonly tooltip?: string;
    readonly detail?: string;
    readonly capabilities: {
        readonly imageInput?: boolean;
        readonly toolCalling?: boolean | number;
    };
}

export interface LanguageModelTextPart {
    readonly value: string;
}

export interface LanguageModelDataPart {
    readonly mimeType: string;
    readonly data: Uint8Array;
}

export interface LanguageModelToolCallPart {
    readonly callId: string;
    readonly name: string;
    readonly input: object;
}

export interface LanguageModelToolResultPart {
    readonly callId: string;
    readonly content: ReadonlyArray<unknown>;
}

export interface LanguageModelChatTool {
    readonly name: string;
    readonly description?: string;
    readonly inputSchema?: Record<string, unknown>;
}

export interface LanguageModelChatRequestMessage {
    readonly role: number;
    readonly content: ReadonlyArray<unknown>;
}

export interface PrepareLanguageModelChatModelOptions {
    readonly silent: boolean;
}

export interface ProvideLanguageModelChatResponseOptions {
    readonly tools?: readonly LanguageModelChatTool[];
    readonly toolMode?: unknown;
}

export type LanguageModelResponsePart =
    | LanguageModelTextPart
    | LanguageModelDataPart
    | LanguageModelToolCallPart;

export interface LanguageModelChatConnection {
    readonly state: ConnectionState;
    readonly onDidChangeState: Event<ConnectionState>;
    ensureConnected?(
        interactive: boolean,
        token: CancellationToken
    ): Promise<void>;
    readonly apiClient:
        | (Pick<ApiClient, "host"> & {
              readonly config: Pick<
                  ApiClient["config"],
                  | "authenticate"
                  | "authType"
                  | "experimentalIsUnifiedHost"
                  | "host"
                  | "workspaceId"
              >;
          })
        | undefined;
    readonly databricksWorkspace: {readonly id: string} | undefined;
}

export interface LanguageModelChatProvider {
    readonly onDidChangeLanguageModelChatInformation: Event<void>;
    provideLanguageModelChatInformation(
        options: PrepareLanguageModelChatModelOptions,
        token: CancellationToken
    ): Promise<LanguageModelChatInformation[]>;
    provideLanguageModelChatResponse(
        model: LanguageModelChatInformation,
        messages: readonly LanguageModelChatRequestMessage[],
        options: ProvideLanguageModelChatResponseOptions,
        progress: Progress<LanguageModelResponsePart>,
        token: CancellationToken
    ): Promise<void>;
    provideTokenCount(
        model: LanguageModelChatInformation,
        text: string | LanguageModelChatRequestMessage,
        token: CancellationToken
    ): Promise<number>;
}

export type UnityGatewayRequest = (
    connection: LanguageModelChatConnection,
    payload: UnityGatewayRequestPayload,
    token: CancellationToken,
    onTextDelta?: (text: string) => void
) => Promise<OpenAIChatCompletionResponse>;

export type UnityGatewayModelDiscovery = (
    connection: LanguageModelChatConnection,
    token: CancellationToken
) => Promise<LanguageModelChatInformation[]>;

export interface UnityGatewayRequestPayload {
    readonly model: string;
    readonly messages: OpenAIChatMessage[];
    readonly maxTokens?: number;
    readonly stream: true;
    readonly tools?: OpenAIChatTool[];
    readonly toolChoice?: "auto" | "required";
}

export interface OpenAIChatCompletionResponse {
    readonly message: OpenAIChatAssistantMessage;
    readonly textWasStreamed?: boolean;
}

export type OpenAIChatMessage =
    | {
          readonly role: "user" | "assistant";
          readonly content: string;
      }
    | {
          readonly role: "tool";
          readonly tool_call_id: string;
          readonly content: string;
      }
    | OpenAIChatAssistantMessage;

export type OpenAIChatAssistantMessage = Readonly<Record<string, unknown>> & {
    readonly role: "assistant";
    readonly content?:
        | string
        | null
        | readonly (Readonly<Record<string, unknown>> & {
              readonly type?: string;
              readonly text?: string;
          })[];
    readonly tool_calls?: readonly OpenAIChatToolCall[];
};

export type OpenAIChatToolCall = Readonly<Record<string, unknown>> & {
    readonly id: string;
    readonly type: "function";
    readonly function: {
        readonly name: string;
        readonly arguments: string;
    };
};

export interface OpenAIChatTool {
    readonly type: "function";
    readonly function: {
        readonly name: string;
        readonly description: string;
        readonly parameters: Record<string, unknown>;
    };
}
