import * as fs from "fs/promises";
import path from "node:path";
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
 * Visibility smoke for the uv-native setup entry: a uv-suitable project shows the
 * "Set up Python environment" row, not the legacy "Python Environment" checklist.
 * Post-GA the gate is uv-suitability alone, no flag (see `isUvSetupSuitable`). The
 * pip → legacy direction is the sibling `python_setup_visibility_legacy.e2e.ts`;
 * provisioning is covered by `setup_local.ucws.e2e.ts`.
 *
 * Hazard: assumes the runner's active interpreter is not a plain venv
 * (`interpreter.venv` is a pip signal); check that first if this flips to legacy.
 */

const LEGACY_GROUP_LABEL = "Python Environment";
const UV_SETUP_LABEL = "Set up Python environment";

describe("Python setup entry visibility (uv-suitable project)", async function () {
    let projectDir: string;
    this.timeout(6 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        projectDir = process.env.WORKSPACE_PATH;

        // No competing-manager markers → uv-suitable. The dev-mode bundle target
        // (no compute) is only there to render the Environment section, which
        // needs connected + development mode.
        await writeRootBundleConfig(
            getBasicBundleConfig({}, false),
            projectDir
        );
        await waitForLogin("DEFAULT");
        await dismissNotifications();
        const workbench = await driver.getWorkbench();
        await workbench.getEditorView().closeAllEditors();
    });

    it("surfaces the uv setup entry, not the legacy checklist", async () => {
        // A stray requirements.txt would force the legacy flow, making this pass
        // for the wrong reason — fail fast instead.
        assert(
            !(await fileExists(path.join(projectDir, "requirements.txt"))),
            "fixture unexpectedly has a requirements.txt (would force the legacy flow)"
        );
        await waitForConfigSurface(UV_SETUP_LABEL, LEGACY_GROUP_LABEL);
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
