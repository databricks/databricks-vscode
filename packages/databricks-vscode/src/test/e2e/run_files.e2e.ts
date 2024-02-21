import path from "node:path";
import * as fs from "fs/promises";
import assert from "node:assert";
import {
    clearBundleConfig,
    createBasicBundleConfig,
    dismissNotifications,
    openFile,
    waitForLogin,
    waitForWorkflowWebview,
} from "./utils.ts";
import {sleep} from "wdio-vscode-service";

describe("Run files", async function () {
    let projectDir: string;
    this.timeout(3 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH);
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

        await createBasicBundleConfig();
        await waitForLogin("DEFAULT");
        await dismissNotifications();
    });

    after(async () => {
        try {
            await clearBundleConfig();
        } catch (e) {
            console.error(e);
        }
    });

    beforeEach(async () => {
        await openFile("hello.py");
    });

    it("should run a python file on a cluster", async () => {
        const workbench = await driver.getWorkbench();
        await workbench.executeQuickPick("Databricks: Upload and Run File");

        const debugOutput = await workbench
            .getBottomBar()
            .openDebugConsoleView();

        while (true) {
            await dismissNotifications();
            await sleep(2000);
            const text = await (await debugOutput.elem).getHTML();
            if (text && text.includes("hello world")) {
                break;
            }
        }
    });

    it("should run a python file as a workflow", async () => {
        const workbench = await driver.getWorkbench();
        await workbench.executeQuickPick("Databricks: Run File as Workflow");
        await dismissNotifications();
        await waitForWorkflowWebview("hello world");
    });
});
