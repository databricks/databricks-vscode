/** A button on an error notification. Running it is the remediation. */
export interface ErrorAction {
    readonly title: string;
    run(): unknown;
}

/**
 * The one error idiom. Kernel and feature logic throw these; only the
 * `CommandRegistry` and views render them.
 */
export class UserFacingError extends Error {
    readonly code: string;
    readonly userMessage: string;
    readonly actions: readonly ErrorAction[];

    constructor(
        code: string,
        userMessage: string,
        options: { actions?: readonly ErrorAction[]; cause?: unknown } = {},
    ) {
        super(userMessage, { cause: options.cause });
        this.name = "UserFacingError";
        this.code = code;
        this.userMessage = userMessage;
        this.actions = options.actions ?? [];
    }
}

/** Thrown when the user dismisses a prompt. Never rendered. */
export class CancelledError extends Error {
    constructor(message = "Cancelled") {
        super(message);
        this.name = "CancelledError";
    }
}

/**
 * Cancellation is silent. Covers our own error, VS Code's `CancellationError`
 * and `AbortSignal` aborts, which all identify themselves by name.
 */
export function isCancellation(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }
    return (
        error.name === "CancelledError" || error.name === "Canceled" || error.name === "AbortError"
    );
}

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
