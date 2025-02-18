import path from "node:path";
import * as fs from "fs/promises";
import assert from "node:assert";
import {
    dismissNotifications,
    executeCommandWhenAvailable,
    getViewItems,
    getViewSection,
    openFile,
    waitForInput,
    waitForLogin,
    waitForNotification,
} from "./utils/commonUtils.ts";
import {
    getBasicBundleConfig,
    writeRootBundleConfig,
} from "./utils/dabsFixtures.ts";
import {CustomTreeSection} from "wdio-vscode-service";

describe("Run files on serverless compute", async function () {
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

        await writeRootBundleConfig(
            getBasicBundleConfig({}, false),
            projectDir
        );
    });

    beforeEach(async () => {
        await openFile("hello.py");
    });

    it("should wait for connection", async () => {
        await waitForLogin("DEFAULT");
        await dismissNotifications();
    });

    it("should prompt to setup virtual environment", async () => {
        const subTreeItems = await getViewItems(
            "CONFIGURATION",
            "Python Environment"
        );
        let promptFound = false;
        for (const item of subTreeItems) {
            const label = await item.getLabel();
            console.log("Python Environment item label: ", label);
            if (label.includes("Activate an environment")) {
                promptFound = true;
                break;
            }
        }
        assert(promptFound, "Prompt to setup virtual environment not found");
    });

    it("should select serverless compute", async () => {
        await executeCommandWhenAvailable("Databricks: Configure cluster");
        const computeInput = await waitForInput();
        await computeInput.selectQuickPick("Serverless");
    });

    it("should setup virtual environment", async () => {
        await executeCommandWhenAvailable(
            "Databricks: Setup python environment"
        );

        // Select Venv as the environment manager
        const envInput = await waitForInput();
        await envInput.selectQuickPick("Venv");

        // Our runner image should have python 3.12+ preinstalled
        const pythonVersionInput = await waitForInput();
        await pythonVersionInput.selectQuickPick(1);

        await waitForNotification("The following environment is selected");
        await waitForNotification("Databricks Connect", "Install");

        await browser.waitUntil(
            async () => {
                const subTreeItems = await getViewItems(
                    "CONFIGURATION",
                    "Python Environment"
                );
                for (const item of subTreeItems) {
                    const label = await item.getLabel();
                    console.log("Python Environment item label: ", label);
                    if (label.includes("Databricks Connect:")) {
                        return true;
                    }
                }
                return false;
            },
            {
                timeout: 60_000,
                interval: 2000,
                timeoutMsg: "Setup confirmation failed",
            }
        );
    });
});
