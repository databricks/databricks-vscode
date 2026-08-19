import path from "node:path";
import * as fs from "fs/promises";
import assert from "node:assert";
import {
    dismissNotifications,
    waitForConfigSurface,
    waitForLogin,
} from "./utils/commonUtils.ts";
import {
    getBasicBundleConfig,
    writeRootBundleConfig,
} from "./utils/dabsFixtures.ts";

/**
 * The NEGATIVE half of the uv-native setup entry's visibility gate — the sibling
 * of `python_setup_visibility.e2e.ts` (which covers the uv-suitable → uv-entry
 * direction). Here a pip-driven project (a `requirements.txt` is a substantive pip
 * signal) is NOT uv-suitable, so the gate must route it to the legacy "Python
 * Environment" checklist group and NOT show the uv-native "Set up Python
 * environment" row. See `isUvSetupSuitable` / `EnvironmentComponent.getRoot`.
 *
 * A separate spec (own window/workspace) rather than a second phase of the
 * positive spec: nothing re-runs the visibility gate on an in-window fixture
 * change (`databricks.environment.refresh` recomputes only the legacy dependencies
 * feature, whose emitter is change-gated), so each direction must be asserted on
 * the first render of its own fixture. No compute, CLI, or uv install is needed,
 * so this runs on the cheap (non-serverless) shard.
 */

// Exact top-level row labels the two mutually exclusive surfaces render.
const LEGACY_GROUP_LABEL = "Python Environment";
const UV_SETUP_LABEL = "Set up Python environment";

describe("Python setup entry visibility (pip project)", async function () {
    let projectDir: string;
    this.timeout(6 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        projectDir = process.env.WORKSPACE_PATH;

        // A pip-driven project: a `requirements.txt` is a substantive pip signal,
        // so the gate treats pip as a competing manager and stays on the legacy
        // checklist. The development-mode bundle target (no compute attached) is
        // what makes the config view render the Environment section at all (it
        // renders only when connected + development mode).
        await fs.writeFile(
            path.join(projectDir, "requirements.txt"),
            "requests\n"
        );
        await writeRootBundleConfig(
            getBasicBundleConfig({}, false),
            projectDir
        );
        await waitForLogin("DEFAULT");
        await dismissNotifications();
        const workbench = await driver.getWorkbench();
        await workbench.getEditorView().closeAllEditors();
    });

    it("shows the legacy checklist, not the uv setup entry", async () => {
        // Sanity-check the fixture stayed pip-driven: without requirements.txt
        // the project would be uv-suitable, and the assertion below would time
        // out on the uv row instead of clearly reporting a bad fixture.
        assert(
            await fileExists(path.join(projectDir, "requirements.txt")),
            "fixture is missing requirements.txt (would not exercise the legacy flow)"
        );
        await waitForConfigSurface(LEGACY_GROUP_LABEL, UV_SETUP_LABEL);
    });
});

async function fileExists(p: string): Promise<boolean> {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}
