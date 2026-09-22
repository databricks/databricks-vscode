/* eslint-disable @typescript-eslint/naming-convention */
import type {OpenAIChatAssistantMessage, OpenAIChatToolCall} from "./types";

// Bound memory while still covering deep agent sessions. VS Code replays the
// full conversation on every turn, so a session with more than this many
// distinct tool-call turns will lose the oldest signatures first.
const MAX_STORED_MESSAGES = 256;

/**
 * Copilot reconstructs assistant tool-call history from name/arguments/id only.
 * Unity Gateway still needs unknown extra fields from the original assistant
 * message (for example per-tool-call signatures). This store remembers those
 * messages and rehydrates them, remapping Copilot's rewritten call ids.
 *
 * VS Code replays the entire conversation on every turn, so restoration must be
 * non-destructive: a stored message can be replayed on many subsequent requests.
 * Create a per-request {@link OpaqueAssistantStateRestoreSession} so repeated
 * identical tool calls within one request resolve to distinct stored messages
 * in order, without consuming them for later requests.
 */
export class OpaqueAssistantStateStore {
    private readonly messagesByFingerprint = new Map<
        string,
        OpenAIChatAssistantMessage[]
    >();

    remember(message: OpenAIChatAssistantMessage): void {
        const fingerprint = toolCallFingerprint(message.tool_calls);
        if (fingerprint === undefined) {
            return;
        }
        const queued = this.messagesByFingerprint.get(fingerprint) ?? [];
        queued.push(message);
        this.messagesByFingerprint.set(fingerprint, queued);
        this.evictOldest();
    }

    createRestoreSession(): OpaqueAssistantStateRestoreSession {
        return new OpaqueAssistantStateRestoreSession(
            this.messagesByFingerprint
        );
    }

    private evictOldest(): void {
        let stored = 0;
        for (const queued of this.messagesByFingerprint.values()) {
            stored += queued.length;
        }
        if (stored <= MAX_STORED_MESSAGES) {
            return;
        }
        for (const [fingerprint, queued] of this.messagesByFingerprint) {
            while (stored > MAX_STORED_MESSAGES && queued.length > 0) {
                queued.shift();
                stored -= 1;
            }
            if (queued.length === 0) {
                this.messagesByFingerprint.delete(fingerprint);
            }
            if (stored <= MAX_STORED_MESSAGES) {
                return;
            }
        }
    }
}

/**
 * Non-destructive view over the stored messages for a single request. Tracks how
 * many times each fingerprint has been restored so repeated identical tool calls
 * within the same request map to successive stored occurrences.
 */
export class OpaqueAssistantStateRestoreSession {
    private readonly cursorsByFingerprint = new Map<string, number>();

    constructor(
        private readonly messagesByFingerprint: ReadonlyMap<
            string,
            readonly OpenAIChatAssistantMessage[]
        >
    ) {}

    restore(
        toolCalls: readonly OpenAIChatToolCall[]
    ): OpenAIChatAssistantMessage | undefined {
        const fingerprint = toolCallFingerprint(toolCalls);
        if (fingerprint === undefined) {
            return undefined;
        }
        const queued = this.messagesByFingerprint.get(fingerprint);
        if (queued === undefined || queued.length === 0) {
            return undefined;
        }
        const cursor = this.cursorsByFingerprint.get(fingerprint) ?? 0;
        this.cursorsByFingerprint.set(fingerprint, cursor + 1);
        const message = queued[Math.min(cursor, queued.length - 1)];
        return rehydrateAssistantMessage(message, toolCalls);
    }
}

export function rehydrateAssistantMessage(
    message: OpenAIChatAssistantMessage,
    toolCalls: readonly OpenAIChatToolCall[]
): OpenAIChatAssistantMessage {
    const cachedToolCalls = message.tool_calls ?? [];
    return {
        ...message,
        tool_calls: cachedToolCalls.map((cachedToolCall, index) => {
            const current = toolCalls[index];
            if (current === undefined) {
                return cachedToolCall;
            }
            return {
                ...cachedToolCall,
                id: current.id,
                function: {
                    ...cachedToolCall.function,
                    name: current.function.name,
                    arguments: current.function.arguments,
                },
            };
        }),
    };
}

export function toolCallFingerprint(
    toolCalls: readonly OpenAIChatToolCall[] | undefined
): string | undefined {
    if (toolCalls === undefined || toolCalls.length === 0) {
        return undefined;
    }
    return JSON.stringify(
        toolCalls.map((toolCall) => [
            toolCall.function.name,
            canonicalizeArguments(toolCall.function.arguments),
        ])
    );
}

function canonicalizeArguments(value: string): unknown {
    try {
        return canonicalizeJson(JSON.parse(value));
    } catch {
        return value;
    }
}

function canonicalizeJson(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(canonicalizeJson);
    }
    if (typeof value !== "object" || value === null) {
        return value;
    }
    return Object.fromEntries(
        Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, nested]) => [key, canonicalizeJson(nested)])
    );
}
