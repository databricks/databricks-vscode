/**
 * The command sweep (`commandSweep.test.ts`) with the workspace unreachable,
 * in a file of its own: the connection check retries with backoff for
 * several seconds first, and the other states needn't wait for it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode } from "../../test-support/vscode";
import { sweep } from "./commandSweep";

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

describe("every command a user can run without arguments", () => {
    beforeEach(() => vscode.reset());
    afterEach(() => vscode.reset());

    it("fails only with a user-facing message, and finishes: a bundle project, workspace unreachable", async () => {
        expect(await sweep("a bundle project, workspace unreachable", tempDir)).toEqual([]);
    }, 120_000);
});
