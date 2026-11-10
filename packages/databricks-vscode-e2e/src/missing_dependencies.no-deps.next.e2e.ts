import assert from "node:assert";
import { getBasicBundleConfig, writeRootBundleConfig } from "./utils/bundle-fixtures.ts";
import {
    executeCommandWhenAvailable,
    notificationActions,
    waitForConfigSurface,
    waitForLogin,
    waitForNotification,
} from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";

/**
 * A window without the extension pack's members (`*.no-deps.*` in
 * wdio.conf.ts), as for a user who disabled or uninstalled them. The
 * activation smoke spec runs there too: the extension activates, signs in and
 * logs no errors. Here the Python setup says it needs the Python extension
 * and offers to install it. Install isn't clicked: the mock workspace's proxy
 * reaches no Marketplace.
 */

const PACK = ["ms-python.python", "ms-python.debugpy", "ms-toolsai.jupyter", "redhat.vscode-yaml"];
const NEEDS_PYTHON =
    "Setting up the Python environment needs the Python extension (ms-python.python).";

describe("Without the extension pack", async function () {
    this.timeout(3 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        // A uv-suitable project on a development target, so the uv setup row shows.
        await writeRootBundleConfig(getBasicBundleConfig({}, false), process.env.WORKSPACE_PATH);
        await waitForLogin("DEFAULT");
        await dismissNotifications();
    });

    it("has none of them", async () => {
        const installed = await browser.executeWorkbench(
            (vscode, ids: string[]) =>
                ids.filter((id) => vscode.extensions.getExtension(id) !== undefined),
            PACK,
        );
        assert.deepStrictEqual(installed, []);
    });

    it("says the Python setup needs the Python extension, with an Install button", async () => {
        await waitForConfigSurface("Set up Python environment", "Python Environment");
        await executeCommandWhenAvailable("Databricks: Setup python environment");
        await waitForNotification(NEEDS_PYTHON);
        assert.deepStrictEqual(await notificationActions(NEEDS_PYTHON), ["Install"]);
    });
});
