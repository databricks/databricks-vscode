import {
    CancellationError,
    Disposable,
    EventEmitter,
    LanguageModelError,
    lm,
} from "vscode";
import type {
    CancellationToken,
    Event,
    LanguageModelChatInformation,
    LanguageModelChatProvider,
    LanguageModelChatRequestMessage,
    LanguageModelResponsePart,
    PrepareLanguageModelChatModelOptions,
    Progress,
    ProvideLanguageModelChatResponseOptions,
} from "vscode";
import {logging} from "@databricks/sdk-experimental";
import type {AiGatewayClient} from "@databricks/sdk-aigateway/v1";
import {Loggers} from "../logger";
import type {UnityGatewayConnectionManager} from "./UnityGatewayConnectionManager";
import {listUnityGatewayModels} from "./unityGatewayModels";
import {
    gatewayMessage,
    isRecord,
    partText,
    toResponseParts,
    toResponsesRequest,
} from "./unityGatewayResponses";

/**
 * Not declared in `contributes.languageModelChatProviders` yet, so VS Code
 * ignores the provider: a declared vendor activates the extension whenever
 * anything lists every vendor's models.
 */
export const UNITY_GATEWAY_VENDOR = "databricks";

/**
 * Offers Unity Gateway models in VS Code Chat. Lists no models while signed
 * out or when listing fails; a failure is logged and retried on the next call.
 * A failed chat request ends the turn with an error, which Chat shows.
 */
export class UnityGatewayChatProvider
    implements LanguageModelChatProvider, Disposable
{
    private readonly _onDidChangeLanguageModelChatInformation =
        new EventEmitter<void>();
    readonly onDidChangeLanguageModelChatInformation: Event<void> =
        this._onDidChangeLanguageModelChatInformation.event;
    private readonly disposables: Disposable[];
    private disposed = false;
    // VS Code asks again on every model lookup, so keep one listing per
    // connection.
    private listing?: {
        client: AiGatewayClient;
        models: Promise<LanguageModelChatInformation[]>;
    };

    constructor(
        private readonly connectionManager: UnityGatewayConnectionManager,
        // VS Code 1.104 ignores the change event, but selecting models makes
        // every version list them again.
        private readonly relistModels = () =>
            lm.selectChatModels({vendor: UNITY_GATEWAY_VENDOR})
    ) {
        this.disposables = [
            this._onDidChangeLanguageModelChatInformation,
            connectionManager.onDidChange(() => {
                // Let go of the old client, and the credentials it holds.
                if (
                    this.listing?.client !== connectionManager.aiGatewayClient
                ) {
                    this.listing = undefined;
                }
                this._onDidChangeLanguageModelChatInformation.fire();
                void this.relistModels().then(undefined, () => {});
            }),
        ];
    }

    async provideLanguageModelChatInformation(
        options: PrepareLanguageModelChatModelOptions,
        token: CancellationToken
    ): Promise<LanguageModelChatInformation[]> {
        const client = this.connectionManager.aiGatewayClient;
        if (this.disposed || client === undefined) {
            return [];
        }
        if (this.listing?.client !== client) {
            this.listing = {client, models: this.listModels(client, token)};
        }
        const models = await this.listing.models;
        // Don't hand back models from a connection or registration that has
        // gone while they were listed.
        return this.disposed ||
            this.connectionManager.aiGatewayClient !== client
            ? []
            : models;
    }

    private async listModels(
        client: AiGatewayClient,
        token: CancellationToken
    ): Promise<LanguageModelChatInformation[]> {
        try {
            return await listUnityGatewayModels(client, token);
        } catch (e) {
            if (this.listing?.client === client) {
                this.listing = undefined;
            }
            if (!token.isCancellationRequested) {
                logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                    "Can't list Unity Gateway models",
                    e
                );
            }
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
        const client = this.connectionManager.responsesClient;
        if (client === undefined) {
            throw LanguageModelError.NoPermissions(
                "Sign in to Unity Gateway in the Databricks extension to use Databricks models."
            );
        }
        const controller = new AbortController();
        const cancellation = token.onCancellationRequested(() =>
            controller.abort()
        );
        try {
            const events = client.createResponse(
                toResponsesRequest(model, messages, options),
                controller.signal
            );
            for await (const part of toResponseParts(events)) {
                progress.report(part);
            }
        } catch (e) {
            if (token.isCancellationRequested) {
                throw new CancellationError();
            }
            logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                "Unity Gateway chat request failed",
                e
            );
            throw chatError(e);
        } finally {
            cancellation.dispose();
        }
    }

    /** A local estimate, like Copilot's own providers; it only feeds prompt budgeting. */
    async provideTokenCount(
        model: LanguageModelChatInformation,
        text: string | LanguageModelChatRequestMessage
    ): Promise<number> {
        const content =
            typeof text === "string"
                ? text
                : text.content.map(partText).join("");
        return Math.ceil(content.length / 4);
    }

    dispose() {
        this.disposed = true;
        this.disposables.forEach((d) => d.dispose());
    }
}

/**
 * What to end a failed chat turn with. Chat shows the message, so it carries
 * the gateway's reason but never the error object itself.
 */
function chatError(e: unknown): Error {
    const status =
        isRecord(e) && typeof e.httpStatusCode === "number"
            ? e.httpStatusCode
            : 0;
    if (status <= 0) {
        // Shown whole: a sign-in that can't refresh ends with the CLI's advice.
        return new Error(
            isRecord(e) && typeof e.message === "string" ? e.message : String(e)
        );
    }
    const message = [
        `Unity Gateway returned HTTP ${status}`,
        gatewayMessage(isRecord(e) ? e.message : undefined),
    ]
        .filter((part) => part !== "")
        .join(": ");
    switch (status) {
        case 401:
        case 403:
            return LanguageModelError.NoPermissions(message);
        case 404:
            return LanguageModelError.NotFound(message);
        case 429:
            return LanguageModelError.Blocked(message);
        default:
            return new Error(message);
    }
}

/**
 * Registers the provider while `isEnabled()`, checking again on each
 * `onDidChangeEnabled`.
 */
export function registerUnityGatewayChatProvider(
    connectionManager: UnityGatewayConnectionManager,
    isEnabled: () => boolean,
    onDidChangeEnabled: Event<void>,
    register = (provider: LanguageModelChatProvider) =>
        lm.registerLanguageModelChatProvider(UNITY_GATEWAY_VENDOR, provider)
): Disposable {
    let registration: Disposable | undefined;
    const update = () => {
        if (!isEnabled()) {
            registration?.dispose();
            registration = undefined;
        } else if (registration === undefined) {
            const provider = new UnityGatewayChatProvider(connectionManager);
            // Runs during activation, so a failure mustn't stop the rest.
            try {
                registration = Disposable.from(register(provider), provider);
            } catch (e) {
                provider.dispose();
                logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                    "Can't register the Databricks model provider",
                    e
                );
            }
        }
    };
    update();
    const enabledListener = onDidChangeEnabled(update);
    return new Disposable(() => {
        enabledListener.dispose();
        registration?.dispose();
    });
}
