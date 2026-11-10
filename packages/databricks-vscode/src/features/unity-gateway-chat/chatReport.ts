// Records one chat request. A failure's fields are read from whatever ended it: the SDK's
// ApiError, Node's network errors, a CLI error, or the reply errors in replyErrors.ts.
import type { TelemetryRecorder } from "../../kernel/telemetry/Telemetry";
import type { Logger } from "../../platform/log";
import {
    UNITY_GATEWAY_CHAT,
    type UnityGatewayChatOutcome,
    type UnityGatewayChatProps,
} from "./telemetry";
import { IncompleteReplyError } from "./replyErrors";
import { httpStatus, isRecord, responseBody, unwrapCode } from "./responses";

/** The outcome and, for a failure, the error the request failed with. */
type ChatResult =
    | { readonly outcome: Exclude<UnityGatewayChatOutcome, "failed"> }
    | { readonly outcome: "failed"; readonly error: unknown };

export interface ChatRequest {
    readonly model: string;
    readonly messagesCount: number;
    readonly toolsCount: number;
    /** The Unity Gateway connection's, when there is one and it knows them. */
    readonly workspaceId?: string | undefined;
    readonly authType?: string | undefined;
}

export interface ChatReport {
    /** The reply's stream sent an event. */
    streamStarted(): void;
    /** A text or tool call reached Chat. Only the first one counts. */
    partShown(): void;
    /** Records the request when it ends. Only the first call counts. */
    finish(result: ChatResult): void;
}

/**
 * Starts the record of one chat request, with its duration from `telemetry.start`
 * like the other events. Telemetry must never change the chat, so a failure to
 * start or send the record is logged and otherwise ignored.
 */
export function startChatReport(
    telemetry: TelemetryRecorder,
    log: Logger,
    request: ChatRequest,
    now: () => number = () => performance.now(),
): ChatReport {
    let record: (props: Omit<UnityGatewayChatProps, "duration">) => void = () => {};
    attempt(log, () => {
        record = telemetry.start(UNITY_GATEWAY_CHAT);
    });
    const start = now();
    let streamed = false;
    let firstPart: number | undefined;
    let finished = false;
    return {
        streamStarted: () => {
            streamed = true;
        },
        partShown: () => {
            firstPart ??= now() - start;
        },
        finish: (result) => {
            // One event per request, whichever path ends it first.
            if (finished) {
                return;
            }
            finished = true;
            attempt(log, () =>
                record({
                    outcome: result.outcome,
                    model: request.model,
                    messagesCount: request.messagesCount,
                    toolsCount: request.toolsCount,
                    replyStarted: streamed,
                    timeToFirstPart: firstPart,
                    workspaceId: request.workspaceId,
                    authType: request.authType,
                    ...(result.outcome === "failed" ? failureFields(result.error) : {}),
                }),
            );
        },
    };
}

/** Runs a recording step; a failure is logged, never thrown into the chat. */
function attempt(log: Logger, step: () => void): void {
    try {
        step();
    } catch (e) {
        log.error("Can't record a Unity Gateway chat request", e);
    }
}

interface FailureFields {
    httpStatus?: number;
    errorCode?: string;
    errorName?: string;
    stopReason?: string;
}

/** Raw categorical facts only: no message, body or other text from the error. */
function failureFields(error: unknown): FailureFields {
    if (!isRecord(error)) {
        return {};
    }
    const status = httpStatus(error);
    const code = reportedCode(error);
    return {
        ...(status > 0 ? { httpStatus: status } : {}),
        ...(code !== undefined ? { errorCode: categorical(code, CODE) } : {}),
        errorName: categorical(typeof error.name === "string" ? error.name : "", ERROR_NAME),
        ...(error instanceof IncompleteReplyError && error.reason !== undefined
            ? { stopReason: categorical(error.reason, CODE) }
            : {}),
    };
}

// What the SDK's ApiError reports for a body that isn't a Databricks error.
const SDK_UNKNOWN = "UNKNOWN";

/**
 * The first code on the error or its causes, else the code in a refused
 * request's body. Node reports a connection that failed with its code on the
 * cause of the `fetch` rejection; a model's own error, such as
 * `{"error": {"code": "context_length_exceeded"}}`, is only in the body.
 */
function reportedCode(error: unknown): string | undefined {
    let current: unknown = error;
    for (let depth = 0; depth < 4 && isRecord(current); depth++) {
        if (typeof current.code === "string" && current.code !== SDK_UNKNOWN) {
            return current.code;
        }
        current = current.cause;
    }
    return unwrapCode(responseBody(error));
}

// Codes in the two shapes they come in: UPPER_SNAKE, as in Databricks' error_code
// (RESOURCE_EXHAUSTED) and Node's codes (ECONNREFUSED, ERR_HTTP2_STREAM_ERROR),
// and lower_snake with an underscore, as in model errors and stop reasons
// (context_length_exceeded, max_output_tokens). A plain word, an id or other
// free text doesn't match.
const CODE = /^(?:[A-Z]+(?:_[A-Z]+[0-9]*)*|[a-z]+(?:_[a-z]+)+)$/;
// Error names such as ApiError or TypeError.
const ERROR_NAME = /^[A-Z][A-Za-z0-9]*$/;
const MAX_CATEGORY_LENGTH = 64;

/** The value if it has the expected shape, else "other". */
function categorical(value: string, shape: RegExp): string {
    return value.length <= MAX_CATEGORY_LENGTH && shape.test(value) ? value : "other";
}
