/**
 * The activation budget: `activate()` returns within 100 ms. It runs
 * the real bootstrap against the `vscode` stand-in, with no folder open and no
 * config file, so the kernel's start does no work that a real window wouldn't,
 * in a local window and in a session window.
 *
 * It times `activate()` alone: the module is imported before the clock starts.
 * What the user waits for also holds the module load, many times longer;
 * the ratchet times it in VS Code (`scripts/perf/activationMetric.mjs`).
 * This budget catches slow work in `register()` on any machine.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activate } from "../../extension";
import { liveListenerCount } from "../../platform/event";
import { installExtensionPack } from "../../test-support/extensionPack";
import { deactivateContext, fakeExtensionContext } from "../../test-support/fakeExtensionContext";
import { SERVERLESS_SESSION_ENV, SESSION_REMOTE_NAME } from "../../test-support/sessionEnv";
import { useTempDirs } from "../../test-support/tempDir";
import { env as vscodeEnv, host as vscode } from "../../test-support/vscode";
import { fakeDatabricksApi, type FakeDatabricksApi } from "../../test-support/fakeDatabricksApi";

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

const ACTIVATION_BUDGET_MS = 100;
const tempDir = useTempDirs();

/**
 * A local window, and a session window, which connects at once with the
 * session's credentials, and starts ms-python to select the session's
 * interpreter.
 */
const HOSTS = [
    { name: "a local window", env: {}, remoteName: undefined, msPython: 0 },
    {
        name: "a session window",
        env: SERVERLESS_SESSION_ENV,
        remoteName: SESSION_REMOTE_NAME,
        msPython: 1,
    },
];

describe.each(HOSTS)("activation budget, in $name", ({ env, remoteName, msPython }) => {
    const saved = { ...process.env };
    let api: FakeDatabricksApi | undefined;
    beforeEach(async () => {
        vscode.reset();
        process.env.DATABRICKS_CONFIG_FILE = "/nonexistent/.databrickscfg";
        delete process.env.DATABRICKS_HOST;
        delete process.env.DATABRICKS_TOKEN;
        delete process.env.DATABRICKS_CONFIG_PROFILE;
        delete process.env.DATABRICKS_REMOTE_ENV;
        Object.assign(process.env, env);
        vscodeEnv.remoteName = remoteName;
        api = await fakeDatabricksApi(async () => Response.json({ userName: "me" }));
    });
    afterEach(async () => {
        process.env = { ...saved };
        vscodeEnv.remoteName = undefined;
        vi.unstubAllGlobals();
        await api?.close();
    });

    it(`returns within ${ACTIVATION_BUDGET_MS} ms`, () => {
        const timings: number[] = [];
        // The first run pays for lazy initialisation in Node, which a real
        // extension host has already done; the budget is for the best of three.
        for (let i = 0; i < 3; i++) {
            const context = fakeExtensionContext(tempDir().dir);
            const started = performance.now();
            const api = activate(context as never);
            timings.push(performance.now() - started);
            expect(api?.version).toBe(2);
            deactivateContext(context);
            vscode.reset();
        }
        expect(Math.min(...timings)).toBeLessThan(ACTIVATION_BUDGET_MS);
    });

    it("starts none of the extension pack's members in a window without a folder, but the session's ms-python", async () => {
        const pack = installExtensionPack();
        const context = fakeExtensionContext(tempDir().dir);
        activate(context as never);
        // `start()` runs after activation returns.
        await new Promise((r) => setTimeout(r, 50));
        expect(pack.msPython.activations).toBe(msPython);
        expect(pack.activated).toEqual([]);
        // VS Code would start Jupyter or debugpy for one of their commands or debug types.
        expect(
            vscode.executed.map((e) => e.command).filter((c) => /^(python|jupyter)\./.test(c)),
        ).toEqual([]);
        expect(vscode.debugSessions).toEqual([]);
        deactivateContext(context);
    });

    it("releases every listener when the extension is disposed", async () => {
        const before = liveListenerCount();
        const context = fakeExtensionContext(tempDir().dir);
        activate(context as never);
        await new Promise((r) => setTimeout(r, 50));
        expect(liveListenerCount()).toBeGreaterThan(before);
        deactivateContext(context);
        expect(liveListenerCount()).toBe(before);
    });
});
