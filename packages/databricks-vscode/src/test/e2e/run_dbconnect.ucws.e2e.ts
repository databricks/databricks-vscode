import path from "node:path";
import * as fs from "fs/promises";
import assert from "node:assert";
import {
    dismissNotifications,
    executeCommandWhenAvailable,
    getTreeViewItems,
    openFile,
    waitForInput,
    waitForLogin,
    waitForNotification,
} from "./utils/commonUtils.ts";
import {
    getBasicBundleConfig,
    writeRootBundleConfig,
} from "./utils/dabsFixtures.ts";

async function checkOutputFile(path: string, expectedContent: string) {
    await browser.waitUntil(
        async () => {
            const fileContent = await fs.readFile(path, "utf-8");
            console.log("Output file content: ", fileContent);
            return fileContent.includes(expectedContent);
        },
        {
            timeout: 60_000,
            interval: 2000,
            timeoutMsg: `Output file "${path}" did not contain "${expectedContent}"`,
        }
    );
    await fs.rm(path);
}

describe("Run files on serverless compute", async function () {
    let projectDir: string;
    this.timeout(3 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");

        projectDir = process.env.WORKSPACE_PATH;

        await fs.writeFile(
            path.join(projectDir, "requirements.txt"),
            ["ipykernel", "setuptools"].join("\n")
        );

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

        await fs.writeFile(
            path.join(nestedDir, "notebook.ipynb"),
            JSON.stringify({
                /* eslint-disable @typescript-eslint/naming-convention */
                cells: [
                    {
                        cell_type: "code",
                        execution_count: null,
                        metadata: {},
                        outputs: [],
                        source: [
                            `from lib import func`,
                            `import os`,
                            `df = func(spark).toPandas()`,
                            `df.to_json(os.path.join(os.getcwd(), "notebook-output.json"))`,
                        ],
                    },
                    {
                        cell_type: "code",
                        execution_count: null,
                        metadata: {},
                        outputs: [],
                        source: [`%run "./hello.py"`],
                    },
                ],
                metadata: {
                    kernelspec: {
                        display_name: "Python 3",
                        language: "python",
                        name: "python3",
                    },
                    orig_nbformat: 4,
                },
                nbformat: 4,
                nbformat_minor: 2,
                /* eslint-enable @typescript-eslint/naming-convention */
            })
        );

        await fs.writeFile(
            path.join(nestedDir, "databricks-notebook.py"),
            [
                "# Databricks notebook source",
                `spark.sql('SELECT "hello world"').show()`,
                "# COMMAND ----------",
                "# DBTITLE 1,My cell title",
                "# MAGIC %sql",
                "# MAGIC select 1 + 1;",
                "# MAGIC select 'hello; world'",
                "# COMMAND ----------",
                `df = _sqldf.toPandas()`,
                `df.to_json(os.path.join(os.getcwd(), "databricks-notebook-output.json"))`,
                "# COMMAND ----------",
                "# MAGIC %run './notebook.ipynb'",
            ].join("\n")
        );

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

    it("should prompt to setup virtual environment", async () => {
        const subTreeItems = await getTreeViewItems(
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

        // Remote runner has miniconda environment preinstalled,
        // but we still want to create a local .venv to test the full flow
        const selectEnvInput = await waitForInput();
        const createNewPick = await selectEnvInput.findQuickPick(
            "Create new environment"
        );
        if (createNewPick) {
            console.log("'Create new environment' pick found, selecting");
            await createNewPick.select();
        } else {
            console.log("'Create new environment' pick not found, moving on");
        }

        // Select Venv as the environment manager
        const envTypeInput = await waitForInput();
        await envTypeInput.selectQuickPick("Venv");
        console.log("Selected Venv as the environment manager");

        // Our runners have python 3.12+ preinstalled
        const pythonVersionInput = await waitForInput();
        await pythonVersionInput.selectQuickPick("Python 3.12");
        console.log("Selected Python Version");

        // Install dependencies from the requirements.txt
        const dependenciesInput = await waitForInput();
        await dependenciesInput.toggleAllQuickPicks(true);
        await dependenciesInput.confirm();

        await waitForNotification("The following environment is selected");
        await waitForNotification("Databricks Connect", "Install");

        await browser.waitUntil(
            async () => {
                const workbench = await browser.getWorkbench();
                const view = await workbench.getBottomBar().openOutputView();
                const outputText = (await view.getText()).join("");
                console.log("Output view text: ", outputText);
                return (
                    outputText.includes("Successfully installed") ||
                    outputText.includes("finished with status 'done'")
                );
            },
            {
                timeout: 60_000,
                interval: 2000,
                timeoutMsg:
                    "Installation output did not contain 'Successfully installed'",
            }
        );

        // On windows we don't always get a notification after installation (TODO: fix it in the extension code),
        // so we need to refresh manually.
        await executeCommandWhenAvailable(
            "Databricks: Refresh python environment status"
        );

        await browser.waitUntil(
            async () => {
                const subTreeItems = await getTreeViewItems(
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

    it("should run a python file with dbconnect", async () => {
        await openFile("hello.py");
        await executeCommandWhenAvailable(
            "Databricks: Run current file with Databricks Connect"
        );
        const output = path.join(projectDir, "file-output.json");
        await checkOutputFile(output, "hello world");
    });

    it("should run a notebook with dbconnect", async () => {
        await openFile("notebook.ipynb");
        await executeCommandWhenAvailable("Notebook: Run All");

        const kernelInput = await waitForInput();
        await kernelInput.selectQuickPick("Python Environments...");
        console.log("Selected 'Python Environments...' option");

        const envInput = await waitForInput();
        await envInput.selectQuickPick(".venv");
        console.log("Selected .venv environment");

        const firstCellOutput = path.join(
            projectDir,
            "nested",
            "notebook-output.json"
        );
        await checkOutputFile(firstCellOutput, "hello world");

        const secondCellOutput = path.join(
            projectDir,
            "nested",
            "file-output.json"
        );
        await checkOutputFile(secondCellOutput, "hello world");
    });

    it("should run a databricks notebook with dbconnect and handle magic comments", async () => {
        await openFile("databricks-notebook.py");
        await executeCommandWhenAvailable("Jupyter: Run All Cells");

        const sqlOutputFile = path.join(
            projectDir,
            "nested",
            "databricks-notebook-output.json"
        );
        await checkOutputFile(sqlOutputFile, "hello; world");

        const runOutputFile = path.join(
            projectDir,
            "nested",
            "notebook-output.json"
        );
        await checkOutputFile(runOutputFile, "hello world");
    });
});
