import path from "node:path";
import * as fs from "fs/promises";
import assert from "node:assert";
import {
    dismissNotifications,
    openFile,
    waitForLogin,
    waitForWorkflowWebview,
} from "./utils/commonUtils.ts";
import {
    getBasicBundleConfig,
    writeRootBundleConfig,
} from "./utils/dabsFixtures.ts";

describe("Run notebooks", async function () {
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
        await fs.mkdir(path.join(projectDir, "a", "b c"), {
            recursive: true,
        });
        await fs.writeFile(
            path.join(projectDir, "a", "b c", "notebook.py"),
            [
                "# Databricks notebook source",
                `spark.sql('SELECT "hello world"').show()`,
                "# COMMAND ----------",
                "# MAGIC %sh pwd",
            ].join("\n")
        );
        await fs.writeFile(
            path.join(projectDir, "notebook.ipynb"),
            JSON.stringify({
                /* eslint-disable @typescript-eslint/naming-convention */
                cells: [
                    {
                        cell_type: "code",
                        execution_count: null,
                        metadata: {},
                        outputs: [],
                        source: [`from lib import func`, "func(spark)"],
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

        await writeRootBundleConfig(getBasicBundleConfig(), projectDir);
        await waitForLogin("DEFAULT");
        await dismissNotifications();
    });

    it("should run a notebook.py file as a workflow", async () => {
        await openFile("notebook.py");
        const workbench = await driver.getWorkbench();
        await workbench.executeQuickPick("Databricks: Run File as Workflow");
        await waitForWorkflowWebview("a/b c");
    });

    it("should run a notebook.ipynb file as a workflow", async () => {
        await openFile("notebook.ipynb");
        const workbench = await driver.getWorkbench();
        await workbench.executeQuickPick("Databricks: Run File as Workflow");
        await waitForWorkflowWebview("hello world");
    });
});
