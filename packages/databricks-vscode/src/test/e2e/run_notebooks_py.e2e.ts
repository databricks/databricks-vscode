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
import {
    getBasicBundleConfig,
    writeRootBundleConfig,
} from "./utils/dabsFixtures.ts";

// We split py and ipynb suites to avoid tests failing on GH workflows,
// likely because the tests open webviews which are heavy on resources.
describe("Run py notebooks", async function () {
    let projectDir: string;
    this.timeout(3 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH);
        projectDir = process.env.WORKSPACE_PATH;

        await fs.mkdir(path.join(projectDir, "a", "b c"), {
            recursive: true,
        });
        await fs.writeFile(
            path.join(projectDir, "a", "b c", "notebook.py"),
            [
                "# Databricks notebook source",
                `spark.sql('SELECT "hello world"').show()`,
                "# COMMAND ----------",
                "# DBTITLE 1,My cell title",
                "# MAGIC %sh pwd",
            ].join("\n")
        );

        await writeRootBundleConfig(getBasicBundleConfig(), projectDir);
    });

    it("should wait for connection", async () => {
        await waitForLogin("DEFAULT");
        await dismissNotifications();
    });

    it("should run a notebook.py file as a workflow", async () => {
        await openFile("notebook.py");
        await executeCommandWhenAvailable("Databricks: Run File as Workflow");
        await waitForWorkflowWebview("a/b c");
    });
});
