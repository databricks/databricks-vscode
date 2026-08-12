import path from "node:path";
import * as fs from "fs/promises";
import assert from "node:assert";
import {
    dismissNotifications,
    executeCommandWhenAvailable,
    openFile,
    waitForLogin,
    waitForWorkflowWebview,
} from "./utils/commonUtils.ts";
import {sleep} from "wdio-vscode-service";
import {
    getBasicBundleConfig,
    writeRootBundleConfig,
} from "./utils/dabsFixtures.ts";

/**
 * Empty the debug console. The whole spec shares one console, so output from an
 * earlier run would otherwise satisfy a later wait.
 */
async function clearDebugConsole() {
    try {
        await browser.executeWorkbench(async (vscode) => {
            // clearReplAction is a ViewAction: it resolves the REPL through
            // getActiveViewWithId and silently does nothing when the console
            // isn't the active view. Focus it first so the clear really happens.
            await vscode.commands.executeCommand(
                "workbench.panel.repl.view.focus"
            );
            await vscode.commands.executeCommand(
                "workbench.debug.panel.action.clearReplAction"
            );
        });
    } catch (e) {
        // Hygiene, not an assertion — don't fail the run over it, but say so,
        // because a stale console can make a later wait pass on old output.
        console.log("Failed to clear the debug console:", e);
    }
}

describe("Run files", async function () {
    let projectDir: string;
    this.timeout(6 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");

        projectDir = process.env.WORKSPACE_PATH;

        await fs.writeFile(
            path.join(projectDir, "lib.py"),
            [
                "def func(spark):",
                `\tspark.sql('SELECT "hello world"').show()`,
            ].join("\n")
        );
        const nestedDir = path.join(projectDir, "nested");
        await fs.mkdir(nestedDir, {recursive: true});
        await fs.writeFile(
            path.join(nestedDir, "hello.py"),
            [`from lib import func`, "func(spark)"].join("\n")
        );

        await writeRootBundleConfig(getBasicBundleConfig(), projectDir);
        await waitForLogin("DEFAULT");
        await dismissNotifications();
    });

    beforeEach(async () => {
        await openFile("hello.py");
    });

    it("should cancel a run during deployment", async () => {
        const workbench = await driver.getWorkbench();

        // The "Uploading bundle assets" toast is only cancellable while
        // `bundle sync` is in flight, and for a project this small that window
        // is well under a second on a Linux runner (0.93s in the nightly
        // failure this guards against). The toast is torn down the moment the
        // upload finishes, so the Cancel click can be issued and still lose:
        // in CI it came back as a stale element reference ~60ms before the
        // upload completed, after which the poll loop had nothing left to
        // retry. Longer timeouts cannot fix that — the window is short because
        // the upload is fast, not because the test is slow. So race the toast
        // with as few round-trips as possible and, when the upload wins,
        // start another run and race the next upload.
        //
        // Scoped to the toast container so a stray "Cancel" elsewhere in the
        // workbench can't satisfy the wait.
        const cancelAction =
            '.notifications-toasts a[role="button"][title="Cancel"]';
        const maxAttempts = 3;
        let sawCancellableToast = false;
        let cancelled = false;

        for (let attempt = 1; attempt <= maxAttempts && !cancelled; attempt++) {
            console.log(`Cancel attempt ${attempt} of ${maxAttempts}`);
            // Losing the race lets a run finish, which prints "hello world" to
            // the debug console — exactly what the next test waits for, and it
            // shares this console. Clear it so neither that test nor the
            // "Cancelled" check below can pass on a previous run's output.
            await clearDebugConsole();
            if (attempt > 1) {
                // beforeEach already opened it for the first attempt.
                await openFile("hello.py");
            }
            await executeCommandWhenAvailable(
                "Databricks: Upload and Run File"
            );

            // Find and click inside one browser.execute. Three things make
            // this fit the window: it cannot go stale (lookup and click are
            // one synchronous JS turn, so the toast can't be disposed between
            // them, which is precisely how CI failed); it is a single
            // round-trip, unlike the message read plus find plus click the old
            // code paid; and it returns immediately when the button is absent,
            // whereas element.click() blocks on wdio's 10s implicit wait and
            // would make a tight poll interval meaningless.
            //
            // The last attempt falls back to wdio's element click — the real
            // input event. If a synthetic DOM click ever stops reaching VS
            // Code's handler, that keeps this a race we can lose rather than a
            // test that always fails.
            const useRealInputEvent = attempt === maxAttempts;
            try {
                await browser.waitUntil(
                    async () => {
                        if (useRealInputEvent) {
                            const button = await browser.$(cancelAction);
                            if (!(await button.isExisting())) {
                                return false;
                            }
                            try {
                                await button.click();
                                return true;
                            } catch {
                                // Disposed mid-click; the upload won.
                                return false;
                            }
                        }
                        return browser.execute((selector) => {
                            const found =
                                document.querySelector<HTMLElement>(selector);
                            found?.click();
                            return Boolean(found);
                        }, cancelAction);
                    },
                    {timeout: 30_000, interval: 100}
                );
                sawCancellableToast = true;
            } catch {
                // The cancellable toast never appeared. Check the debug console
                // before racing another upload.
            }

            // Ground truth: killing the in-flight `bundle sync` surfaces a
            // cancellation error in the debug console. Re-open the view on
            // every attempt, since starting a run reveals the bundle logs
            // output channel over it.
            const debugOutput = await workbench
                .getBottomBar()
                .openDebugConsoleView();
            try {
                await browser.waitUntil(
                    async () => {
                        const text = await (await debugOutput.elem).getHTML();
                        return Boolean(text && text.includes("Cancelled"));
                    },
                    {timeout: 20_000, interval: 1_000}
                );
                cancelled = true;
            } catch {
                // The upload won this race; retry with a fresh run.
            }
        }

        assert(
            cancelled,
            sawCancellableToast
                ? `Cancel was clicked but the run never reported 'Cancelled', in all ${maxAttempts} runs`
                : "The cancellable 'Uploading bundle assets' notification never appeared"
        );
    });

    it("should run a python file on a cluster", async () => {
        const workbench = await driver.getWorkbench();
        await executeCommandWhenAvailable("Databricks: Upload and Run File");

        const debugOutput = await workbench
            .getBottomBar()
            .openDebugConsoleView();

        while (true) {
            await sleep(2000);
            const text = await (await debugOutput.elem).getHTML();
            if (text && text.includes("hello world")) {
                break;
            }
        }
    });

    it("should run a python file as a workflow", async () => {
        await executeCommandWhenAvailable("Databricks: Run File as Workflow");
        await waitForWorkflowWebview("hello world");
    });
});
