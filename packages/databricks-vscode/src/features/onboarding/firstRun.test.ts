import { describe, expect, it } from "vitest";
import { chooseFirstRunSurface } from "./firstRun";

const withNotes =
    (...available: string[]) =>
    (p: string) =>
        available.includes(p);

describe("chooseFirstRunSurface", () => {
    it("opens nothing on a fresh install, since VS Code opens the Quickstart walkthrough", () => {
        expect(
            chooseFirstRunSurface({
                previousVersion: undefined,
                currentVersion: "2.20.0",
                hasNotes: withNotes("resources/whats-new/2.20.md"),
            }),
        ).toEqual({ kind: "none" });
    });

    it.each([
        ["a minor upgrade", "1.1.2", "1.2.3"],
        ["a major upgrade", "0.1.2", "1.2.3"],
    ])("opens the curated notes for %s", (_name, previousVersion, currentVersion) => {
        expect(
            chooseFirstRunSurface({
                previousVersion,
                currentVersion,
                hasNotes: withNotes("resources/whats-new/1.2.md"),
            }),
        ).toEqual({ kind: "whatsNew", notes: "resources/whats-new/1.2.md" });
    });

    it.each([
        ["a patch upgrade", "1.2.1", "1.2.2", withNotes("resources/whats-new/1.2.md")],
        [
            "a minor upgrade without notes (no CHANGELOG fallback)",
            "1.1.2",
            "1.3.3",
            withNotes("resources/whats-new/1.2.md"),
        ],
        ["a downgrade", "1.3.0", "1.2.0", withNotes("resources/whats-new/1.2.md")],
        ["the same version", "1.2.0", "1.2.0", withNotes("resources/whats-new/1.2.md")],
        [
            "an unknown previous version",
            undefined,
            "1.2.0",
            withNotes("resources/whats-new/1.2.md"),
        ],
    ])("opens nothing for %s", (_name, previousVersion, currentVersion, hasNotes) => {
        expect(
            chooseFirstRunSurface({
                previousVersion,
                currentVersion,
                hasNotes,
            }),
        ).toEqual({ kind: "none" });
    });
});
