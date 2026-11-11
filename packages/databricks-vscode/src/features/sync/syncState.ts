import {
    parseSyncError,
    parseSyncEvent,
    type SyncEvent,
} from "../../kernel/cli/commands/bundleSync";

/**
 * The states the old `CodeSynchronizer` reported, with their old names: the
 * e2e specs read `WATCHING_FOR_CHANGES` and `STOPPED` from the Remote Folder
 * row.
 */
export type SyncState =
    | "IN_PROGRESS"
    | "WATCHING_FOR_CHANGES"
    | "STOPPED"
    | "FILES_IN_REPOS_DISABLED"
    | "FILES_IN_WORKSPACE_DISABLED"
    | "ERROR";

export interface SyncStatus {
    readonly state: SyncState;
    /** Why an `ERROR` happened, when the CLI said. */
    readonly reason?: string;
}

export function isRunning(state: SyncState): boolean {
    return state === "IN_PROGRESS" || state === "WATCHING_FOR_CHANGES";
}

/** A failure ends a sync; a later stop or exit doesn't replace what failed. */
export function isFailure(state: SyncState): boolean {
    return (
        state === "ERROR" ||
        state === "FILES_IN_REPOS_DISABLED" ||
        state === "FILES_IN_WORKSPACE_DISABLED"
    );
}

/**
 * Whether a sync in `from` may move to `to`. A failure stays until the next
 * start, so the Remote Folder row keeps saying why sync stopped. The old
 * terminal kept the two "disabled" states only; its own stop then replaced
 * an `ERROR` with `STOPPED`, so the error row rarely showed.
 */
export function canMove(from: SyncStatus, to: SyncStatus): boolean {
    if (from.state === to.state && from.reason === to.reason) {
        return false;
    }
    return !isFailure(from.state) || to.state === "IN_PROGRESS";
}

/** What one line of the CLI's output means: a new state, and text for the terminal. */
export interface SyncLineResult {
    readonly status?: SyncStatus;
    readonly text?: string;
}

/** The terminal's text for an event, as the old parser wrote it. */
function eventText(event: SyncEvent): string | undefined {
    switch (event.type) {
        case "start":
            return `Starting synchronization (${(event.put?.length ?? 0) + (event.delete?.length ?? 0)} files)`;
        case "progress":
            // Only finished files are shown.
            return event.progress === 1
                ? `${event.action === "put" ? "Uploaded" : "Deleted"} ${event.path}`
                : undefined;
        case "complete":
            return "Completed synchronization";
    }
}

function eventState(event: SyncEvent): SyncState | undefined {
    switch (event.type) {
        case "start":
            return "IN_PROGRESS";
        case "complete":
            return "WATCHING_FOR_CHANGES";
        default:
            return undefined;
    }
}

function errorStatus(line: string): SyncStatus | undefined {
    const error = parseSyncError(line);
    if (error === undefined) {
        return undefined;
    }
    if (error.kind === "filesInWorkspaceDisabled") {
        return { state: "FILES_IN_WORKSPACE_DISABLED" };
    }
    if (error.kind === "filesInReposDisabled") {
        return { state: "FILES_IN_REPOS_DISABLED" };
    }
    return { state: "ERROR", reason: error.reason };
}

/** A stdout line: a JSON event, or an `Error: …` line. Other lines are dropped, as before. */
export function readStdoutLine(line: string): SyncLineResult {
    const event = parseSyncEvent(line);
    if (event !== undefined) {
        const state = eventState(event);
        return { status: state === undefined ? undefined : { state }, text: eventText(event) };
    }
    return { status: errorStatus(line) };
}

/** A stderr line: shown in the terminal, and an `Error: …` line fails the sync. */
export function readStderrLine(line: string): SyncLineResult {
    const text = line.trim();
    return text === "" ? {} : { status: errorStatus(text), text };
}
