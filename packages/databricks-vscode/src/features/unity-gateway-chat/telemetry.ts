// No VS Code imports here: the telemetry generator loads this file under plain Node.
import {
    durationComment,
    telemetryEvent,
    type DurationMeasurement,
} from "../../kernel/telemetry/definitions";

/**
 * How a chat request ended. `notConnected`: there was no Unity Gateway
 * connection to send it on, so it never reached the gateway.
 */
export type UnityGatewayChatOutcome = "ok" | "empty" | "failed" | "cancelled" | "notConnected";

/** One event per chat request made from VS Code Chat, with its outcome. */
export const UNITY_GATEWAY_CHAT = telemetryEvent<
    {
        outcome: UnityGatewayChatOutcome;
        model: string;
        messagesCount: number;
        toolsCount: number;
        replyStarted: boolean;
        timeToFirstPart?: number;
        stopReason?: string;
        httpStatus?: number;
        errorCode?: string;
        errorName?: string;
        workspaceId?: string;
        authType?: string;
    } & DurationMeasurement
>("unityGatewayChat", "A chat request to a Unity Gateway model, made from VS Code Chat", {
    outcome: {
        comment:
            "The outcome: 'ok' (the reply completed), 'empty' (it completed with no text and no tool call), 'failed', 'cancelled' (the user stopped it), or 'notConnected' (no Unity Gateway connection to send it on)",
    },
    model: { comment: "The model id, e.g. system.ai.claude-sonnet-4-6" },
    messagesCount: {
        comment: "The number of messages in the request, which holds the whole conversation",
    },
    toolsCount: { comment: "The number of tools offered to the model" },
    replyStarted: {
        comment: "Whether the reply's stream sent any event before the request ended",
    },
    timeToFirstPart: {
        comment:
            "The time in milliseconds until the first text or tool call reached Chat. Omitted when none did",
    },
    stopReason: {
        comment:
            "Why the reply stopped early, as the gateway reported it (e.g. max_output_tokens). Omitted unless the reply stopped early with a reason",
    },
    httpStatus: {
        comment:
            "The HTTP status of a request the gateway refused. Omitted unless the outcome is failed on a refusal",
    },
    errorCode: {
        comment:
            "The code the failure reported: for a refusal, the gateway's error_code or the code in a model's error body (e.g. context_length_exceeded); the code of an error in the reply's stream (e.g. server_error); or Node's code for a network failure (e.g. ECONNREFUSED). 'other' when it isn't shaped like a code. Omitted when there was none",
    },
    errorName: {
        comment:
            "The name of the error that failed the request (e.g. ApiError). 'other' when it isn't shaped like an error name. Omitted unless the outcome is failed",
    },
    workspaceId: {
        comment:
            "The workspace id of the Unity Gateway connection that sent the request. Omitted when unknown",
    },
    authType: {
        comment:
            "The auth type of the Unity Gateway connection that sent the request. Omitted when there is no connection",
    },
    ...durationComment,
});

/** The properties of `unityGatewayChat`, with its duration. */
export type UnityGatewayChatProps = NonNullable<(typeof UNITY_GATEWAY_CHAT)["_props"]>;

export const UNITY_GATEWAY_CHAT_EVENTS = [UNITY_GATEWAY_CHAT];
