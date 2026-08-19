import path from "node:path";
import * as fs from "fs/promises";
import assert from "node:assert";
import {CustomTreeSection, InputBox} from "wdio-vscode-service";
import {
    dismissNotifications,
    executeCommandWhenAvailable,
    getViewSection,
    openFile,
    waitForLogin,
    waitForNotification,
} from "./utils/commonUtils.ts";
import {
    getBasicBundleConfig,
    writeRootBundleConfig,
} from "./utils/dabsFixtures.ts";

// The uv-native setup entry is opt-in: it unlocks only when this feature id is
// present in `databricks.experiments.optInto` (PYTHON_SETUP_FEATURE_ID). We set
// it at Workspace scope from the test so it stays contained to this project's
// folder and never reroutes another spec's "Setup python environment" command.
const PYTHON_SETUP_FEATURE_ID = "environment.pythonSetup";

// Ground-truth text the flow surfaces on success — the config-view row label
// (persistent) and the completion toast (transient). We assert on the row.
const READY_LABEL = "Python environment ready";
const DRIFTED_LABEL = "out of sync";

// uv writes the interpreter into `.venv` at the project root. Resolve it the
// same way the extension does (platform-specific), so the fs ground-truth check
// works on the Windows shard too.
function venvPython(projectDir: string): string {
    return process.platform === "win32"
        ? path.join(projectDir, ".venv", "Scripts", "python.exe")
        : path.join(projectDir, ".venv", "bin", "python");
}

async function fileExists(p: string): Promise<boolean> {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

/**
 * Wait for the quick-input widget to appear, WITHOUT gating on its progress bar
 * clearing (which `waitForInput` does). The compute picker keeps a progress bar
 * up while it lazily loads the cluster list — slow enough on the Windows shard to
 * blow `waitForInput`'s 10s budget — yet the static "Serverless" item is
 * selectable the whole time. The version picker likewise only appears after an
 * I/O-bound version resolution, so allow it a generous window to show.
 */
async function waitForQuickInput(timeoutMs = 60_000): Promise<InputBox> {
    const workbench = await browser.getWorkbench();
    return new InputBox(workbench.locatorMap).wait(timeoutMs);
}

/**
 * Wait for uv to finish provisioning: the ground truth is the `.venv`
 * interpreter existing on disk. Provisioning first auto-installs uv (CI runners
 * lack it), then shells out to uv for a Python download + databricks-connect
 * install against a cold serverless target, so this is minutes, not seconds —
 * hence the generous budget, mirroring the serverless DBConnect specs. We gate on
 * the file rather than the completion toast, which can expire before a poll sees
 * it on the slow Windows shard.
 */
async function waitForVenvInterpreter(projectDir: string, timeoutMs = 420_000) {
    const python = venvPython(projectDir);
    await browser.waitUntil(async () => fileExists(python), {
        timeout: timeoutMs,
        interval: 2000,
        timeoutMsg: `uv did not create the .venv interpreter at "${python}"`,
    });
}

/**
 * Assert the config-view Python-environment row reports the ready end-state and
 * is not showing the out-of-sync (drift) state — the persistent observable of a
 * successful setup, more reliable than the transient toast.
 *
 * In the uv-native flow the entry is a TOP-LEVEL row (label "Python environment
 * ready" / "…is out of sync"), not a child of a "Python Environment" group — the
 * group wrapper exists only for the legacy checklist (see
 * `EnvironmentComponent.getRoot`). So scan the CONFIGURATION section's visible
 * items directly rather than opening a group that isn't there.
 */
async function waitForPythonEnvReady(timeoutMs = 60_000) {
    await browser.waitUntil(
        async () => {
            const section = (await getViewSection("CONFIGURATION")) as
                | CustomTreeSection
                | undefined;
            if (!section) {
                return false;
            }
            for (const item of await section.getVisibleItems()) {
                const label = await item.getLabel();
                console.log("CONFIGURATION item label:", label);
                if (label.includes(DRIFTED_LABEL)) {
                    return false;
                }
                if (label.includes(READY_LABEL)) {
                    return true;
                }
            }
            return false;
        },
        {
            timeout: timeoutMs,
            interval: 2000,
            timeoutMsg: `Config view never reported "${READY_LABEL}"`,
        }
    );
}

/**
 * Poll for a DBConnect run's output file to contain the expected text, then
 * remove it so a later run can't pass on a stale file.
 */
async function checkOutputFile(
    filePath: string,
    expected: string,
    timeoutMs = 180_000
) {
    await browser.waitUntil(
        async () => {
            try {
                const content = await fs.readFile(filePath, "utf-8");
                return content.includes(expected);
            } catch {
                return false;
            }
        },
        {
            timeout: timeoutMs,
            interval: 2000,
            timeoutMsg: `Output file "${filePath}" did not contain "${expected}" within ${timeoutMs}ms`,
        }
    );
    await fs.rm(filePath);
}

describe("Set up local Python environment (uv) on serverless", async function () {
    let projectDir: string;
    this.timeout(15 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        projectDir = process.env.WORKSPACE_PATH;

        // A DBConnect entrypoint that runs a query and writes the result, so the
        // uv-provisioned databricks-connect can be verified end-to-end. Mirrors
        // the layout the serverless DBConnect spec uses (lib at the root, the run
        // file under nested/, output written to the run's cwd = projectDir).
        await fs.writeFile(
            path.join(projectDir, "lib.py"),
            `def func(spark):\treturn spark.sql('SELECT "hello world"')`
        );
        const nestedDir = path.join(projectDir, "nested");
        await fs.mkdir(nestedDir, {recursive: true});
        await fs.writeFile(
            path.join(nestedDir, "hello.py"),
            [
                `from lib import func`,
                `import os`,
                `df = func(spark).toPandas()`,
                `df.to_json(os.path.join(os.getcwd(), "file-output.json"))`,
            ].join("\n")
        );

        // Serverless project: no top-level cluster_id, so compute resolves to the
        // serverless target the ticket calls for.
        await writeRootBundleConfig(
            getBasicBundleConfig({}, false),
            projectDir
        );
    });

    it("should wait for connection", async () => {
        await waitForLogin("DEFAULT");
        await dismissNotifications();
        const workbench = await driver.getWorkbench();
        await workbench.getEditorView().closeAllEditors();
    });

    it("should opt into uv setup and select a serverless version", async () => {
        // Opt in at Workspace scope. `isPythonSetupEnabled()` reads this config
        // live, so the setup command routes to the uv flow on the next click
        // without a window reload.
        await browser.executeWorkbench(async (vscode, featureId) => {
            await vscode.workspace
                .getConfiguration("databricks.experiments")
                .update(
                    "optInto",
                    [featureId],
                    vscode.ConfigurationTarget.Workspace
                );
        }, PYTHON_SETUP_FEATURE_ID);

        // setup-local requires uv, and the CI runners do not ship it, so preflight
        // would fail fast with E_UV_MISSING. Set the CLI's documented auto-install
        // opt-in in the extension host's env — the extension spawns setup-local
        // with `{...process.env}`, so the CLI installs uv itself instead of aborting.
        await browser.executeWorkbench(async () => {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            process.env.DATABRICKS_LOCALENV_AUTO_INSTALL_UV = "1";
        });

        // Attach serverless. With the feature opted in, selecting serverless
        // prompts for (and persists) the environment version up front, so the
        // subsequent setup run resolves compute without re-prompting.
        await executeCommandWhenAvailable("Databricks: Configure compute");
        const computeInput = await waitForQuickInput();
        await computeInput.selectQuickPick("Serverless");

        // The version picker lists candidates best-first (the recommended one is
        // starred at index 0). Take the recommendation rather than pinning a
        // version string, which drifts as new serverless versions ship.
        const versionInput = await waitForQuickInput();
        await versionInput.selectQuickPick(0);
    });

    it("should set up the environment with uv (setup-local)", async () => {
        // The router command; opted in + a clean (uv-suitable) project routes it
        // to the uv flow, which shells out to `databricks environments
        // setup-local`. Compute + version are already resolved, so no prompt.
        await executeCommandWhenAvailable(
            "Databricks: Setup python environment"
        );

        await waitForVenvInterpreter(projectDir);

        // The completion toast is informational and can expire before a poll
        // catches it; the persistent config-view row is the real end-state.
        try {
            await waitForNotification(READY_LABEL, undefined, 15_000);
        } catch (e) {
            console.log(
                `"${READY_LABEL}" toast not observed; relying on the config-view row.`,
                e
            );
        }

        await browser.executeWorkbench(async (vscode) => {
            await vscode.commands.executeCommand(
                "databricks.environment.refresh"
            );
        });
        await waitForPythonEnvReady();
    });

    it("should run a python file with Databricks Connect from the uv env", async () => {
        // Verifies the uv-provisioned databricks-connect imports and runs against
        // serverless — no manual install fallback, so a broken provision fails
        // the test rather than being papered over.
        await openFile("hello.py");
        await executeCommandWhenAvailable(
            "Databricks: Run current file with Databricks Connect"
        );
        await checkOutputFile(
            path.join(projectDir, "file-output.json"),
            "hello world"
        );
    });

    it("should be idempotent on re-run (stays ready, no drift)", async () => {
        // The re-run affordance is palette-hidden (when:false), so invoke it by
        // id. A no-change re-run must leave the environment ready and not flip the
        // row to the out-of-sync (drift) state; the CLI's own diskMutated=false is
        // the underlying idempotency guarantee, covered at the CLI/unit level.
        const python = venvPython(projectDir);
        assert(await fileExists(python), "expected .venv from the setup step");

        // Clear the setup step's success toast (it is persistent — it carries a
        // "View Details" button) so the one awaited below is the RE-RUN's, not a
        // stale match.
        await dismissNotifications();

        // executeCommand resolves when the (re-entrancy-guarded) run settles; a
        // re-run over an already-provisioned env is a warm uv sync, so it returns
        // quickly rather than paying another cold provision.
        await browser.executeWorkbench(async (vscode) => {
            await vscode.commands.executeCommand(
                "databricks.environment.rerunPythonEnv"
            );
        });

        // A fresh "Python environment ready" toast is the re-run-SPECIFIC success
        // signal. A failed run never clears readiness (readyRoots/state persist)
        // and never removes the .venv, so the interpreter and the ready row alone
        // can't tell a successful re-run from a failed one — but a failure shows
        // an error toast instead of this one, so requiring it fails the test on a
        // broken re-run.
        await waitForNotification(READY_LABEL);

        // End-state is intact: interpreter present, row ready, not drifted.
        assert(
            await fileExists(python),
            ".venv interpreter vanished after re-run"
        );
        await browser.executeWorkbench(async (vscode) => {
            await vscode.commands.executeCommand(
                "databricks.environment.refresh"
            );
        });
        await waitForPythonEnvReady();
    });
});
