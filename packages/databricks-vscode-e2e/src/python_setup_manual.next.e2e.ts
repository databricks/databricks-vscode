import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { getBasicBundleConfig, writeRootBundleConfig } from "./utils/bundle-fixtures.ts";
import {
    executeCommandWhenAvailable,
    waitForConfigSurface,
    waitForLogin,
    waitForNotification,
} from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";

/**
 * Opting out of the automated Python setup (PYENV-06), which no
 * frozen spec covers. In a uv-suitable project (as in
 * `python_setup_visibility`), "Use manual Python environment setup" writes
 * the workspace setting, and PROJECT switches from the uv entry to the
 * checklist of the external setup.
 */

const LEGACY_GROUP_LABEL = "Python Environment";
const UV_SETUP_LABEL = "Set up Python environment";

describe("Manual Python environment setup", async function () {
    let root: string;

    this.timeout(6 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        root = process.env.WORKSPACE_PATH;
        await writeRootBundleConfig(getBasicBundleConfig({}, false), root);
        await waitForLogin("DEFAULT");
        await dismissNotifications();
    });

    it("should start with the uv setup entry", async () => {
        await waitForConfigSurface(UV_SETUP_LABEL, LEGACY_GROUP_LABEL);
    });

    it("should switch to the external checklist when the setup is made manual", async () => {
        await executeCommandWhenAvailable("Databricks: Use manual Python environment setup");
        await waitForNotification("Automated Python environment setup is now off");
        await waitForConfigSurface(LEGACY_GROUP_LABEL, UV_SETUP_LABEL);
        const settings = JSON.parse(
            await fs.readFile(path.join(root, ".vscode", "settings.json"), "utf-8"),
        ) as Record<string, unknown>;
        assert.strictEqual(settings["databricks.python.environmentSetup"], "manual");
    });

    it("should switch back when the setting is cleared", async () => {
        await browser.executeWorkbench(async (vscode) => {
            await vscode.workspace
                .getConfiguration("databricks")
                .update("python.environmentSetup", undefined, vscode.ConfigurationTarget.Workspace);
        });
        await waitForConfigSurface(UV_SETUP_LABEL, LEGACY_GROUP_LABEL);
    });
});
