/* eslint-disable @typescript-eslint/naming-convention */
import type {OpenAIChatAssistantMessage, OpenAIChatToolCall} from "./types";

const MAX_STORED_MESSAGES = 32;

/**
 * Copilot reconstructs assistant tool-call history from name/arguments/id only.
 * Unity Gateway still needs unknown extra fields from the original assistant
 * message (for example per-tool-call signatures). This store remembers those
 * messages and rehydrates them, remapping Copilot's rewritten call ids.
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

    restore(
        toolCalls: readonly OpenAIChatToolCall[]
    ): OpenAIChatAssistantMessage | undefined {
        const fingerprint = toolCallFingerprint(toolCalls);
        if (fingerprint === undefined) {
            return undefined;
        }
        const queued = this.messagesByFingerprint.get(fingerprint);
        const message = queued?.shift();
        if (queued !== undefined && queued.length === 0) {
            this.messagesByFingerprint.delete(fingerprint);
        }
        if (message === undefined) {
            return undefined;
        }
        return rehydrateAssistantMessage(message, toolCalls);
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
