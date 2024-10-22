import path from "node:path";
import * as fs from "fs/promises";
import assert from "node:assert";
import {
    dismissNotifications,
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
    this.timeout(3 * 60 * 1000);

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
        // We enable the run command when the active editor is changed.
        // We wait here to avoid race conditions between the extension logic enabling this command and tests executing it.
        await sleep(1000);
    });

    it("should run a python file on a cluster", async () => {
        const workbench = await driver.getWorkbench();
        await workbench.executeQuickPick("Databricks: Upload and Run File");

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

    it("should cancel a run during deployment", async () => {
        const workbench = await driver.getWorkbench();
        await workbench.executeQuickPick("Databricks: Upload and Run File");
        await browser.waitUntil(async () => {
            const notifications = await workbench.getNotifications();
            for (const notification of notifications) {
                const message = await notification.getMessage();
                if (message.includes("Uploading bundle assets")) {
                    // Make sure the CLI is actually spawned before cancelling
                    await sleep(500);
                    await notification.takeAction("Cancel");
                    return true;
                }
            }
            return false;
        });
        const debugOutput = await workbench
            .getBottomBar()
            .openDebugConsoleView();
        while (true) {
            const text = await (await debugOutput.elem).getHTML();
            if (text && text.includes("Cancelled")) {
                break;
            } else {
                await sleep(2000);
            }
        }
    });

    it("should run a python file as a workflow", async () => {
        const workbench = await driver.getWorkbench();
        await workbench.executeQuickPick("Databricks: Run File as Workflow");
        await waitForWorkflowWebview("hello world");
    });
});
