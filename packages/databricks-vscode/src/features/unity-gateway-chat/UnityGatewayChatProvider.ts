import { CancellationError, EventEmitter, lm } from "vscode";
import type {
    CancellationToken,
    Disposable,
    Event,
    LanguageModelChatInformation,
    LanguageModelChatProvider,
    LanguageModelChatRequestMessage,
    LanguageModelResponsePart,
    PrepareLanguageModelChatModelOptions,
    Progress,
    ProvideLanguageModelChatResponseOptions,
} from "vscode";
import type { Connection } from "../../kernel/connection/ConnectionService";
import { connectRemedy } from "../../kernel/connection/openConnection";
import type { TelemetryRecorder } from "../../kernel/telemetry/Telemetry";
import {
    UNITY_GATEWAY_VENDOR,
    type UnityGatewayModel,
} from "../../kernel/unity-gateway/UnityGatewayModels";
import {
    EmptyReplyError,
    UnityGatewayResponsesClient,
} from "../../kernel/unity-gateway/UnityGatewayResponsesClient";
import type { UnityGatewayService } from "../../kernel/unity-gateway/UnityGatewayService";
import type { Logger } from "../../platform/log";
import { abortable } from "../../platform/timers";
import { startChatReport } from "./chatReport";
import {
    gatewayMessage,
    httpStatus,
    isRecord,
    partText,
    responseBody,
    toResponseParts,
    toResponsesRequest,
    unwrapMessage,
} from "./responses";

/** Why a chat request needs a sign-in: no connection to use, or the one it used stopped working. */
export type SignInFailure =
    | { readonly kind: "notConnected" }
    | { readonly kind: "expired"; readonly connection: Connection };

// A proxy's error page can be long.
const MAX_LOGGED_BODY_LENGTH = 4_096;
// For the models Unity Gateway reports no limits for.
const MAX_INPUT_TOKENS = 128_000;
const MAX_OUTPUT_TOKENS = 4_096;

/**
 * Offers Unity Gateway models in VS Code Chat, ported from the old
 * extension. Lists no models while signed out or when listing fails; a
 * failure is logged and the listing is tried again on the next call. A
 * failed chat request ends the turn with an error that says what to do
 * next, which Chat shows, and offers to sign in again when that could fix it.
 */
export class UnityGatewayChatProvider implements LanguageModelChatProvider, Disposable {
    private readonly changed = new EventEmitter<void>();
    readonly onDidChangeLanguageModelChatInformation: Event<void> = this.changed.event;
    private readonly subscription: Disposable;
    private disposed = false;

    constructor(
        private readonly telemetry: TelemetryRecorder,
        private readonly gateway: Pick<UnityGatewayService, "state" | "connection" | "models">,
        private readonly log: Logger,
        /** Offers to sign in, for a request with no connection to use or one whose sign-in stopped working. */
        private readonly promptSignIn: (failure: SignInFailure) => void,
        // The change event makes VS Code list the models again; selecting them does too, on versions that ignore it.
        private readonly relistModels = () => lm.selectChatModels({ vendor: UNITY_GATEWAY_VENDOR }),
    ) {
        // Not on a failure: VS Code would list again at once, and the listing would be retried in a loop.
        this.subscription = gateway.models.onDidChange((state) => {
            if (state.status === "ready" || state.status === "idle") {
                this.changed.fire();
                void this.relistModels().then(undefined, () => {});
            }
        });
    }

    async provideLanguageModelChatInformation(
        _options: PrepareLanguageModelChatModelOptions,
        token: CancellationToken,
    ): Promise<LanguageModelChatInformation[]> {
        if (this.disposed || token.isCancellationRequested) {
            return [];
        }
        // The listing is shared, so a cancelled lookup stops waiting for it, not the listing itself.
        const controller = new AbortController();
        const cancellation = token.onCancellationRequested(() => controller.abort());
        try {
            const models = await abortable(this.gateway.models.list(), controller.signal);
            return this.disposed ? [] : models.map(toInformation);
        } catch (e) {
            if (!token.isCancellationRequested) {
                this.log.error("Can't list Unity Gateway models", e);
            }
            return [];
        } finally {
            cancellation.dispose();
        }
    }

    async provideLanguageModelChatResponse(
        model: LanguageModelChatInformation,
        messages: readonly LanguageModelChatRequestMessage[],
        options: ProvideLanguageModelChatResponseOptions,
        progress: Progress<LanguageModelResponsePart>,
        token: CancellationToken,
    ): Promise<void> {
        const connection = this.gateway.connection;
        const chat = startChatReport(this.telemetry, this.log, {
            model: model.id,
            messagesCount: messages.length,
            toolsCount: options.tools?.length ?? 0,
            workspaceId: connection?.workspaceId,
            authType: connection?.authType,
        });
        if (connection === undefined) {
            // Recorded first, so a failing prompt can't lose the event.
            chat.finish({ outcome: "notConnected" });
            // Switching workspace leaves no connection until it connects.
            if (this.gateway.state.value.status !== "connecting") {
                this.promptSignIn({ kind: "notConnected" });
            }
            throw chatFailure(
                "Sign in to Unity Gateway in the Databricks extension to use Databricks models.",
            );
        }
        const controller = new AbortController();
        let cancellation: Disposable | undefined;
        try {
            cancellation = token.onCancellationRequested(() => controller.abort());
            const events = connection.api
                .get(UnityGatewayResponsesClient)
                .createResponse(toResponsesRequest(model, messages, options), controller.signal);
            for await (const part of toResponseParts(events, () => chat.streamStarted())) {
                chat.partShown();
                progress.report(part);
            }
            chat.finish({ outcome: "ok" });
        } catch (e) {
            if (token.isCancellationRequested) {
                chat.finish({ outcome: "cancelled" });
                throw new CancellationError();
            }
            chat.finish(
                e instanceof EmptyReplyError
                    ? { outcome: "empty" }
                    : { outcome: "failed", error: e },
            );
            // Log the gateway's reason, not its body, which may quote the request; markup has no reason, so log it capped.
            const body = responseBody(e);
            const reason = body !== "" ? refusalReason(e) : "";
            const logged =
                reason !== ""
                    ? reason
                    : body.length > MAX_LOGGED_BODY_LENGTH
                      ? `${body.slice(0, MAX_LOGGED_BODY_LENGTH)}…`
                      : body;
            this.log.error(
                logged === ""
                    ? "Unity Gateway chat request failed"
                    : `Unity Gateway chat request failed: ${logged}`,
                e,
            );
            // A request left over from an old connection says nothing about the current one.
            if (
                needsSignIn(e, connection.authType) &&
                this.gateway.connection?.api === connection.api
            ) {
                this.promptSignIn({ kind: "expired", connection });
            }
            throw chatError(e);
        } finally {
            cancellation?.dispose();
        }
    }

    /** A local estimate, like Copilot's own providers; it only feeds prompt budgeting. */
    async provideTokenCount(
        _model: LanguageModelChatInformation,
        text: string | LanguageModelChatRequestMessage,
    ): Promise<number> {
        const content = typeof text === "string" ? text : text.content.map(partText).join("");
        return Math.ceil(content.length / 4);
    }

    dispose() {
        this.disposed = true;
        this.subscription.dispose();
        this.changed.dispose();
    }
}

function toInformation(model: UnityGatewayModel): LanguageModelChatInformation {
    const { limits } = model;
    return {
        id: model.id,
        name: model.name,
        family: model.family,
        version: "1",
        detail: "Databricks",
        // Copilot can fill the whole input budget, and the window holds the reply too.
        maxInputTokens: limits ? limits.input - limits.output : MAX_INPUT_TOKENS,
        maxOutputTokens: limits?.output ?? MAX_OUTPUT_TOKENS,
        capabilities: { toolCalling: true, imageInput: false },
    };
}

/**
 * What a failure says. Node reports a connection that failed on every address
 * of a host with an empty message and only a code.
 */
function errorText(e: unknown): string {
    if (isRecord(e) && typeof e.message === "string" && e.message !== "") {
        return e.message;
    }
    if (isRecord(e) && typeof e.code === "string") {
        return e.code;
    }
    return String(e);
}

const NEXT_STEPS = new Map([
    // Usually the model rejecting something Chat sends, but not always.
    [400, "If this keeps happening with this model, choose another model."],
    [401, "Sign in to Unity Gateway again."],
    [403, "Ask a workspace admin for access, or choose another model."],
    [404, "Choose another model."],
    [429, "Try again later."],
]);

/**
 * What to end a failed chat turn with. Chat shows the message, so it carries
 * the gateway's reason and what to do next, but never the error object itself.
 */
function chatError(e: unknown): Error {
    const status = httpStatus(e);
    if (status <= 0) {
        // Shown whole: a sign-in that can't refresh ends with the CLI's advice.
        return chatFailure(errorText(e));
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

/**
 * Whether signing in again could fix a failure: the gateway rejected the
 * token, or the CLI couldn't refresh it (as the sign-in itself decides).
 */
function needsSignIn(e: unknown, authType: string): boolean {
    return httpStatus(e) === 401 || connectRemedy(authType, e) === "signInAgain";
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
