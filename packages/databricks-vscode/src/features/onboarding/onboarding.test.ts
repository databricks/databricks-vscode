import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import { fakeFeatureHost, fakeKernel } from "../../test-support/fakes";
import { SERVERLESS_SESSION } from "../../test-support/sessionEnv";
import { host as vscode } from "../../test-support/vscode";
import { onboarding } from "./index";
import { LAST_INSTALLED_VERSION } from "./state";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(options: { session?: boolean } = {}) {
    const kernel = fakeKernel(options.session ? { host: SERVERLESS_SESSION } : {});
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures([onboarding], fake.host);
    return { kernel, ...fake, registered };
}

describe("onboarding", () => {
    beforeEach(() => vscode.reset());

    it("opens the Quickstart walkthrough", async () => {
        setup();
        await vscode.commands.get("databricks.quickstart.open")?.();
        expect(vscode.executed.at(-1)?.command).toBe("workbench.action.openWalkthrough");
        expect(vscode.executed.at(-1)?.args[0]).toBe("databricks.databricks#quickstart");
    });

    it("on a fresh install, opens nothing (VS Code opens the walkthrough) and records the version", async () => {
        const { kernel, registered } = setup();
        startFeatures(registered);
        await settle();
        expect(vscode.executed).toEqual([]);
        expect(kernel.state.get(LAST_INSTALLED_VERSION)).toBe("2.20.0");

        // The next activation opens nothing.
        startFeatures(registered);
        await settle();
        expect(vscode.executed).toEqual([]);
    });

    it("opens nothing in a session window, and leaves the first-run state, the laptop's, alone", async () => {
        const { kernel, registered } = setup({ session: true });
        startFeatures(registered);
        await settle();
        expect(vscode.executed).toEqual([]);
        expect(kernel.state.get(LAST_INSTALLED_VERSION)).toBeUndefined();
    });

    it("waits for the window to be focused before opening What's New", async () => {
        const fs = await import("node:fs");
        const exists = vi.spyOn(fs.default, "existsSync").mockReturnValue(true);
        const { kernel, registered } = setup();
        await kernel.state.set(LAST_INSTALLED_VERSION, "2.19.0");
        vscode.windowFocused = false;
        startFeatures(registered);
        await settle();
        expect(vscode.executed).toEqual([]);
        vscode.windowState.fire({ focused: true });
        await settle();
        expect(vscode.executed.map((e) => e.command)).toEqual(["markdown.showPreview"]);
        exists.mockRestore();
    });
});
