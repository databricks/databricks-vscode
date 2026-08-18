import * as fs from "fs/promises";
import path from "node:path";
import assert from "node:assert";
import {CustomTreeSection} from "wdio-vscode-service";
import {
    dismissNotifications,
    getViewSection,
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
 * This spec asserts the POSITIVE direction — a uv-suitable (clean) project
 * surfaces the top-level "Set up Python environment" row and NOT the legacy
 * "Python Environment" checklist group. That is the behaviour GA turned on and
 * that no other e2e exercises. The negative direction (a pip project stays on the
 * legacy checklist) is already covered end-to-end by `run_dbconnect.ucws.e2e.ts`
 * — it writes a `requirements.txt` and asserts the "Python Environment" group —
 * and at the unit level by `pythonSetupGate.test.ts` / `EnvironmentComponent.test.ts`.
 *
 * Kept deterministic on purpose: the fixture is uv-suitable on disk before login,
 * so the very first render of the config view (driven by the login/connection
 * refresh) evaluates the gate against the intended state — no mid-window fixture
 * flip, which `databricks.environment.refresh` would NOT reliably re-render (it
 * recomputes the legacy dependencies feature, whose emitter is change-gated, and
 * does not re-run the uv visibility gate). No compute, CLI, or uv install is
 * needed, so this runs on the cheap (non-serverless) shard.
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

/**
 * Wait until the CONFIGURATION section shows `expected` as a top-level row and
 * does NOT show `forbidden`. Both surfaces are top-level rows (the uv entry is
 * promoted out of the group wrapper — see `EnvironmentComponent.getRoot`), so
 * scan the section's visible items directly rather than opening a group. Match
 * labels exactly: "Set up Python environment" and "Python Environment" would
 * otherwise overlap on a substring test.
 */
async function waitForConfigSurface(
    expected: string,
    forbidden: string,
    timeoutMs = 60_000
) {
    await browser.waitUntil(
        async () => {
            const section = (await getViewSection("CONFIGURATION")) as
                | CustomTreeSection
                | undefined;
            if (!section) {
                return false;
            }
            let sawExpected = false;
            for (const item of await section.getVisibleItems()) {
                const label = await item.getLabel();
                if (label === forbidden) {
                    return false;
                }
                if (label === expected) {
                    sawExpected = true;
                }
            }
            return sawExpected;
        },
        {
            timeout: timeoutMs,
            interval: 1000,
            timeoutMsg: `CONFIGURATION never showed "${expected}" without "${forbidden}"`,
        }
    );
}

describe("Python setup entry visibility", async function () {
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

    it("surfaces the uv setup entry for a uv-suitable project", async () => {
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
