/** A reply that stopped early. `reason` is the gateway's `incomplete_details.reason`, when it gave one. */
export class IncompleteReplyError extends Error {
    constructor(readonly reason: string | undefined) {
        super(`Unity Gateway stopped the reply early: ${reason ?? "unknown reason"}`);
        this.name = "IncompleteReplyError";
    }
}

/** An error the gateway sent in the reply's stream. `code` is what it reported, if anything. */
export class StreamError extends Error {
    constructor(
        message: string,
        readonly code: string | undefined,
    ) {
        super(message);
        this.name = "StreamError";
    }
}

/** A reply whose stream ended before a completed, incomplete or failed event. */
export class UnfinishedReplyError extends Error {
    constructor() {
        super("Unity Gateway ended the reply before it finished.");
        this.name = "UnfinishedReplyError";
    }
}
