/**
 * Every command a user can start without arguments (from the Command
 * Palette, a view's title bar or a welcome view's link), run through the
 * real features and kernel in the states a window is often in. A command may
 * refuse with a UserFacingError, or open a prompt, which the sweep
 * dismisses. It must not fail with any other error, which the registry
 * shows as "Error running command <id>: ...", and must not keep running once
 * its prompts are dismissed and the processes it started have exited.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode } from "../../test-support/vscode";
import { NO_ARGUMENT_COMMANDS, sweep, type Variant } from "./commandSweep";

// It loads `vscode` itself, which exists only in the host.
vi.mock("@vscode/extension-telemetry", () => ({
    TelemetryReporter: class {
        sendTelemetryEvent() {}
        sendTelemetryErrorEvent() {}
        dispose() {
            return Promise.resolve();
        }
    },
}));

const tempDir = useTempDirs();
const VARIANTS: Variant[] = [
    "no folder, no config file",
    "a folder without a bundle, signed in",
    "a bundle project, signed in",
    "a bundle project, signed in, with the extension pack",
    // Before the connection resolves and the first validate ends: commands run before initialization finishes.
    "a bundle project, right after activation",
    "a bundle project, token rejected",
    // Where commands a session lacks are refused, and the target guard may pause the project.
    "a session window, without a folder",
    "a session window, with a bundle project",
    "a session window, with a target in another workspace",
];

describe("every command a user can run without arguments", () => {
    beforeEach(() => vscode.reset());
    afterEach(() => vscode.reset());

    it("covers the commands of every feature", () => {
        expect(NO_ARGUMENT_COMMANDS.length).toBeGreaterThan(40);
    });

    it.each(VARIANTS)(
        "fails only with a user-facing message, and finishes: %s",
        async (variant) => {
            expect(await sweep(variant, tempDir)).toEqual([]);
        },
        120_000,
    );
});
