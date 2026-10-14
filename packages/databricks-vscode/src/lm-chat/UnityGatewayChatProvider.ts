import {CancellationError, Disposable, EventEmitter, lm} from "vscode";
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
import {ConfigError, logging} from "@databricks/sdk-experimental";
import type {AiGatewayClient} from "@databricks/sdk-aigateway/v1";
import {Loggers} from "../logger";
import {isReauthRequiredError} from "../python-setup/utils/authErrors";
import type {UnityGatewayConnectionManager} from "./UnityGatewayConnectionManager";
import {listUnityGatewayModels} from "./unityGatewayModels";
import {
    gatewayMessage,
    isRecord,
    partText,
    toResponseParts,
    toResponsesRequest,
    unwrapMessage,
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
 * A failed chat request ends the turn with an error, which Chat shows, and
 * offers to sign in again when that could fix it.
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
        private readonly promptSignIn: (message: string) => void,
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
            // Switching workspace drops the clients until it connects.
            if (this.connectionManager.state === "DISCONNECTED") {
                this.promptSignIn("Unity Gateway isn't connected.");
            }
            throw chatFailure(
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
            // So the log has the gateway's reason even when the SDK couldn't
            // read it.
            const body = responseBody(e);
            logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                body === ""
                    ? "Unity Gateway chat request failed"
                    : `Unity Gateway chat request failed: ${body}`,
                e
            );
            if (needsSignIn(e)) {
                this.promptSignIn("Your Unity Gateway sign-in has expired.");
            }
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
 * What a failure says. Node reports a connection that failed on every address
 * of a host with an empty message and only a code.
 */
function errorText(e: unknown): string {
    // The SDK adds its config to the CLI's own message and advice.
    if (e instanceof ConfigError) {
        return e.baseMessage;
    }
    if (isRecord(e) && typeof e.message === "string" && e.message !== "") {
        return e.message;
    }
    if (isRecord(e) && typeof e.code === "string") {
        return e.code;
    }
    return String(e);
}

const NEXT_STEPS = new Map([
    [401, "Sign in to Unity Gateway again."],
    [403, "Ask a workspace admin for access, or choose another model."],
    [404, "Choose another model."],
    [429, "Try again later."],
]);

/**
 * What to end a failed chat turn with. Chat shows the message, so it carries
 * the gateway's reason but never the error object itself.
 */
function chatError(e: unknown): Error {
    const status = httpStatus(e);
    if (status <= 0) {
        // Shown whole: a sign-in that can't refresh ends with the CLI's advice.
        return chatFailure(errorText(e));
    }
    if (status === 400) {
        // The model's own complaint about the request doesn't help the user.
        // It's in the log.
        return chatFailure(
            "Unity Gateway returned HTTP 400. This model can't handle requests from VS Code Chat. Choose another model."
        );
    }
    let message = [`Unity Gateway returned HTTP ${status}`, refusalReason(e)]
        .filter((part) => part !== "")
        .join(": ");
    const nextStep = NEXT_STEPS.get(status);
    if (nextStep !== undefined) {
        message += /[.!?…]$/.test(message) ? ` ${nextStep}` : `. ${nextStep}`;
    }
    return chatFailure(message);
}

/** 0 when the failure isn't the gateway refusing the request. */
function httpStatus(e: unknown): number {
    return isRecord(e) && typeof e.httpStatusCode === "number"
        ? e.httpStatusCode
        : 0;
}

/**
 * Whether signing in again could fix a failure: the gateway rejected the
 * token, or the CLI couldn't refresh it.
 */
function needsSignIn(e: unknown): boolean {
    return httpStatus(e) === 401 || isReauthRequiredError(errorText(e));
}

/**
 * The gateway's reason for refusing a request. The SDK finds no message in a
 * body that isn't a Databricks error, so fall back to the body itself, unless
 * it's markup such as a proxy's error page, or JSON without a message.
 */
function refusalReason(e: unknown): string {
    const reason = gatewayMessage(isRecord(e) ? e.message : undefined);
    const body = responseBody(e);
    return reason !== "" || body.startsWith("<")
        ? reason
        : gatewayMessage(unwrapMessage(body) ?? "");
}

/** A refused request's body as text. */
function responseBody(e: unknown): string {
    return isRecord(e) && e.httpBody instanceof Uint8Array
        ? new TextDecoder().decode(e.httpBody).trim()
        : "";
}

/**
 * Copilot shows a thrown error's stack in Chat, and VS Code gives every
 * `LanguageModelError` a new one, so a failure is a plain error with none.
 */
function chatFailure(message: string): Error {
    const error = new Error(message);
    delete error.stack;
    return error;
}

/**
 * Registers the provider while `isEnabled()`, checking again on each
 * `onDidChangeEnabled`.
 */
export function registerUnityGatewayChatProvider(
    connectionManager: UnityGatewayConnectionManager,
    promptSignIn: (message: string) => void,
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
            const provider = new UnityGatewayChatProvider(
                connectionManager,
                promptSignIn
            );
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
