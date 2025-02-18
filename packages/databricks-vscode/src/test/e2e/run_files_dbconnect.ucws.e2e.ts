import path from "node:path";
import * as fs from "fs/promises";
import assert from "node:assert";
import {
    dismissNotifications,
    executeCommandWhenAvailable,
    getViewSection,
    waitForInput,
    waitForLogin,
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

    it("should wait for connection", async () => {
        await waitForLogin("DEFAULT");
        await dismissNotifications();
    });

    it("should prompt to setup virtual environment", async () => {
        const viewSection = (await getViewSection("CONFIGURATION")) as
            | CustomTreeSection
            | undefined;
        assert(viewSection, "CONFIGURATION section doesn't exist");
        const subTreeItems = await viewSection.openItem("Python Environment");
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

    it("should setup virtual environment", async () => {
        await executeCommandWhenAvailable(
            "Databricks: Setup python environment"
        );

        const envInput = await waitForInput();
        await envInput.selectQuickPick("Venv");
        const pythonInput = await waitForInput();
        await pythonInput.selectQuickPick(1);

        await browser.waitUntil(
            async () => {
                const workbench = await browser.getWorkbench();
                for (const notification of await workbench.getNotifications()) {
                    const label = await notification.getMessage();
                    if (
                        label.includes("The following environment is selected")
                    ) {
                        return true;
                    }
                }
                return false;
            },
            {
                timeout: 60_000,
                interval: 2000,
                timeoutMsg: "Venv creation failed",
            }
        );

        await executeCommandWhenAvailable(
            "Databricks: Setup python environment"
        );

        await browser.waitUntil(
            async () => {
                const workbench = await browser.getWorkbench();
                for (const notification of await workbench.getNotifications()) {
                    const label = await notification.getMessage();
                    if (label.includes("Databricks Connect")) {
                        await notification.takeAction("Install");
                        return true;
                    }
                }
                return false;
            },
            {
                timeout: 60_000,
                interval: 2000,
                timeoutMsg: "DBConnect installation failed",
            }
        );
    });
});
