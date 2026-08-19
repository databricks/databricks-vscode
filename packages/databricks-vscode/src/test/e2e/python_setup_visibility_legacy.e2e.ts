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
 * Negative half of the visibility gate (sibling of `python_setup_visibility.e2e.ts`):
 * a pip project (`requirements.txt` is a pip signal) stays on the legacy "Python
 * Environment" checklist and must NOT show the uv setup row. A separate spec, not a
 * second phase, because nothing re-runs the gate on an in-window fixture change
 * (`environment.refresh` recomputes only the change-gated legacy dependencies
 * feature) — so each direction is asserted on its own fixture's first render.
 */

const LEGACY_GROUP_LABEL = "Python Environment";
const UV_SETUP_LABEL = "Set up Python environment";

describe("Python setup entry visibility (pip project)", async function () {
    let projectDir: string;
    this.timeout(6 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        projectDir = process.env.WORKSPACE_PATH;

        // requirements.txt makes the project pip-driven (competing) → legacy. The
        // dev-mode bundle target (no compute) is only there to render the
        // Environment section, which needs connected + development mode.
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
        // Without requirements.txt the project is uv-suitable; fail fast rather
        // than time out on the uv row.
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
