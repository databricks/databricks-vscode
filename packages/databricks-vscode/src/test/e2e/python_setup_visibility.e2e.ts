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
 * Smoke test for the uv-native setup entry's VISIBILITY — not its provisioning
 * (the full uv sync is covered by `setup_local.ucws.e2e.ts`, the CLI's own
 * acceptance suite, and manual dogfood). There is no feature flag post-GA: the
 * entry is shown purely when the active project is uv-suitable, i.e. no competing
 * manager (pip/poetry/conda) is driving it. See `isUvSetupSuitable` /
 * `makePythonSetupVisibility` / `EnvironmentComponent.getRoot`.
 *
 * This spec covers the POSITIVE direction — a uv-suitable (clean) project surfaces
 * the top-level "Set up Python environment" row and NOT the legacy "Python
 * Environment" checklist group. The NEGATIVE direction (a pip project stays on the
 * legacy checklist) is the sibling `python_setup_visibility_legacy.e2e.ts`. They
 * are separate specs on purpose: each asserts on the FIRST config-view render of
 * its own fixture, which is deterministic; the two states cannot share one window,
 * because nothing re-runs the visibility gate on an in-window fixture change
 * (`databricks.environment.refresh` recomputes only the legacy dependencies
 * feature, whose emitter is change-gated). No compute, CLI, or uv install is
 * needed, so both run on the cheap (non-serverless) shard.
 *
 * Note on the CI interpreter: uv-suitability also requires the active interpreter
 * not to be a plain venv (`interpreter.venv` is a substantive pip signal). That
 * holds on the e2e runner — `setup_local.ucws` reaches the uv flow on a clean
 * project, and `runSetup` bails on `!isVisible()` — so a clean project is
 * uv-suitable here. If this ever regresses to the legacy group, the runner's
 * active interpreter source is the first thing to check.
 */

// Exact top-level row labels the two mutually exclusive surfaces render.
const LEGACY_GROUP_LABEL = "Python Environment";
const UV_SETUP_LABEL = "Set up Python environment";

describe("Python setup entry visibility (uv-suitable project)", async function () {
    let projectDir: string;
    this.timeout(6 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        projectDir = process.env.WORKSPACE_PATH;

        // A uv-suitable project: a development-mode bundle target and no
        // competing-manager markers (no requirements.txt / poetry / conda), so
        // the gate routes it to the uv-native entry. The bundle target also makes
        // the config view render the Environment section (it renders only when
        // connected + development mode). No compute is attached (topLevelComputeId
        // = false) — visibility does not depend on it, and it keeps the fixture to
        // exactly what the section-render precondition needs.
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
        // Sanity-check the fixture stayed uv-suitable: a stray requirements.txt
        // would silently route the project to the legacy checklist and make the
        // assertion below misleading rather than a real gate check.
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
