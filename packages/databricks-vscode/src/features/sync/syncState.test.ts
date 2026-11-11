import { describe, expect, it } from "vitest";
import { canMove, readStderrLine, readStdoutLine } from "./syncState";

// Ported from the old `SyncParser.test.ts`.
describe("sync output", () => {
    it("ignores empty and non-JSON stdout lines", () => {
        expect(readStdoutLine("")).toEqual({ status: undefined });
        expect(readStdoutLine("foo")).toEqual({ status: undefined });
    });

    it("moves to IN_PROGRESS on start and WATCHING_FOR_CHANGES on complete", () => {
        expect(readStdoutLine(`{"type": "start"}`).status).toEqual({ state: "IN_PROGRESS" });
        expect(readStdoutLine(`{"type": "complete"}`).status).toEqual({
            state: "WATCHING_FOR_CHANGES",
        });
    });

    it("writes start events to the terminal, with the number of files", () => {
        expect(
            readStdoutLine(`{"type": "start", "put": ["hello"], "delete": ["world"]}`).text,
        ).toBe("Starting synchronization (2 files)");
    });

    it("writes finished progress events to the terminal", () => {
        expect(
            readStdoutLine(
                `{"type": "progress", "action": "put", "path": "hello", "progress": 0.0}`,
            ).text,
        ).toBeUndefined();
        expect(
            readStdoutLine(
                `{"type": "progress", "action": "put", "path": "hello", "progress": 1.0}`,
            ),
        ).toEqual({
            status: undefined,
            text: "Uploaded hello",
        });
        expect(
            readStdoutLine(
                `{"type": "progress", "action": "delete", "path": "hello", "progress": 1.0}`,
            ).text,
        ).toBe("Deleted hello");
    });

    it("writes complete events to the terminal", () => {
        expect(
            readStdoutLine(`{"type": "complete", "put": ["hello"], "delete": ["world"]}`).text,
        ).toBe("Completed synchronization");
    });

    it("shows stderr, and fails on its error lines", () => {
        expect(readStderrLine("  Starting sync  ")).toEqual({
            status: undefined,
            text: "Starting sync",
        });
        expect(readStderrLine("")).toEqual({});
        expect(readStderrLine("Error: boom")).toEqual({
            status: { state: "ERROR", reason: "boom" },
            text: "Error: boom",
        });
        expect(readStderrLine("Error: Files in Workspace is disabled").status).toEqual({
            state: "FILES_IN_WORKSPACE_DISABLED",
        });
        expect(readStderrLine("Error: Files in Repos is disabled").status).toEqual({
            state: "FILES_IN_REPOS_DISABLED",
        });
        expect(readStdoutLine("Error: on stdout too").status).toEqual({
            state: "ERROR",
            reason: "on stdout too",
        });
    });
});

describe("state changes", () => {
    it("keeps a failure until the next start", () => {
        expect(canMove({ state: "ERROR", reason: "boom" }, { state: "STOPPED" })).toBe(false);
        expect(canMove({ state: "ERROR", reason: "boom" }, { state: "ERROR" })).toBe(false);
        expect(canMove({ state: "FILES_IN_WORKSPACE_DISABLED" }, { state: "ERROR" })).toBe(false);
        expect(canMove({ state: "FILES_IN_REPOS_DISABLED" }, { state: "STOPPED" })).toBe(false);
        expect(canMove({ state: "ERROR" }, { state: "IN_PROGRESS" })).toBe(true);
    });

    it("moves between the other states, but not to the same one", () => {
        expect(canMove({ state: "STOPPED" }, { state: "IN_PROGRESS" })).toBe(true);
        expect(canMove({ state: "IN_PROGRESS" }, { state: "WATCHING_FOR_CHANGES" })).toBe(true);
        expect(canMove({ state: "WATCHING_FOR_CHANGES" }, { state: "IN_PROGRESS" })).toBe(true);
        expect(canMove({ state: "WATCHING_FOR_CHANGES" }, { state: "STOPPED" })).toBe(true);
        expect(canMove({ state: "WATCHING_FOR_CHANGES" }, { state: "ERROR", reason: "x" })).toBe(
            true,
        );
        expect(canMove({ state: "STOPPED" }, { state: "STOPPED" })).toBe(false);
    });
});
