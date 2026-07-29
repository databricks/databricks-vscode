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
        await executeCommandWhenAvailable("Databricks: Upload and Run File");

        // Catching the in-flight "Uploading bundle assets" toast and clicking
        // its Cancel action is a tight race on the slow Windows shard: the
        // toast is transient and its action button can lag the toast body by a
        // few frames. A throw from takeAction() inside a waitUntil condition
        // rejects the whole wait — wdio does NOT retry a condition that throws
        // — which is exactly the "element wasn't found" failure observed in CI.
        // Guard both the message read and the click so a not-yet-rendered
        // button just retries on the next poll, and only resolve once the click
        // actually lands. Fail closed with a clear message if the cancellable
        // toast never appears.
        let cancelled = false;
        await browser.waitUntil(
            async () => {
                const notifications = await workbench.getNotifications();
                console.log("Notifications:", notifications.length);
                for (const notification of notifications) {
                    let message: string;
                    try {
                        message = await notification.getMessage();
                    } catch {
                        // Notification vanished between listing and read — skip.
                        continue;
                    }
                    console.log("Message:", message);
                    if (message.includes("Uploading bundle assets")) {
                        try {
                            await notification.takeAction("Cancel");
                            cancelled = true;
                            return true;
                        } catch {
                            // The Cancel button hasn't rendered yet; retry.
                            return false;
                        }
                    }
                }
                return false;
            },
            {
                timeout: 60_000,
                interval: 500,
                timeoutMsg:
                    "The cancellable 'Uploading bundle assets' notification never appeared",
            }
        );
        assert(
            cancelled,
            "Failed to click Cancel on the deployment notification"
        );

        // Previously an unbounded `while (true)` poll: if "Cancelled" never
        // showed (cancel didn't register, or the deploy already finished) it
        // spun until the per-test mocha timeout surfaced as a bare
        // `Error: Timeout` with no context. Bound the wait so a genuine miss
        // fails fast with a diagnostic reason instead.
        const debugOutput = await workbench
            .getBottomBar()
            .openDebugConsoleView();
        await browser.waitUntil(
            async () => {
                const text = await (await debugOutput.elem).getHTML();
                return Boolean(text && text.includes("Cancelled"));
            },
            {
                timeout: 120_000,
                interval: 2_000,
                timeoutMsg:
                    "Deployment run did not report 'Cancelled' in the debug console",
            }
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
