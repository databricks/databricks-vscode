/* eslint-disable @typescript-eslint/naming-convention */
import path from "node:path";
import * as fs from "fs/promises";
import assert from "node:assert";
import {
    dismissNotifications,
    getViewSection,
    startSyncIfStopped,
    waitForSyncComplete,
    waitForTreeItems,
} from "./utils.ts";
import {sleep} from "wdio-vscode-service";

describe("Run job on cluster with workspace", async function () {
    let projectDir: string;
    this.timeout(2 * 60 * 1000);

    before(async () => {
        assert(process.env.TEST_DEFAULT_CLUSTER_ID);
        assert(process.env.TEST_WORKSPACE_FOLDER_PATH);
        assert(process.env.WORKSPACE_PATH);
        projectDir = process.env.WORKSPACE_PATH;

        await fs.mkdir(path.join(projectDir, ".databricks"), {
            recursive: true,
        });

        await fs.mkdir(path.join(projectDir, ".vscode"), {
            recursive: true,
        });
        await fs.writeFile(
            path.join(projectDir, ".vscode", "settings.json"),
            JSON.stringify({
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "databricks.sync.destinationType": "workspace",
            })
        );

        await fs.writeFile(
            path.join(projectDir, ".databricks", "project.json"),
            JSON.stringify({
                clusterId: process.env["TEST_DEFAULT_CLUSTER_ID"],
                profile: "DEFAULT",
                workspacePath: process.env["TEST_WORKSPACE_FOLDER_PATH"],
            })
        );
        await fs.writeFile(
            path.join(projectDir, "file.py"),
            `spark.sql('SELECT "hello world"').show()`
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
            path.join(projectDir, "notebook_ipynb.ipynb"),
            JSON.stringify({
                cells: [
                    {
                        cell_type: "code",
                        execution_count: null,
                        metadata: {},
                        outputs: [],
                        source: ['print("hello")'],
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
            })
        );
        const section = await getViewSection("CONFIGURATION");
        assert(section);
        await waitForTreeItems(section);
        await dismissNotifications();
    });

    it("should run a python notebook as a job on a cluster", async () => {
        await startSyncIfStopped();
        await waitForSyncComplete();

        const workbench = await driver.getWorkbench();
        const editorView = workbench.getEditorView();
        await editorView.closeAllEditors();

        // open file
        const input = await workbench.openCommandPrompt();
        await sleep(200);
        await input.setText("notebook.py");
        await input.confirm();
        await sleep(500);

        // run file
        await workbench.executeQuickPick(
            "Databricks: Run File as Workflow on Databricks"
        );

        await dismissNotifications();
        const webView = await workbench.getWebviewByTitle(/Databricks Job Run/);
        await webView.open();

        /* eslint-disable @typescript-eslint/naming-convention */
        const labelToDefaults = {
            taskRunId: {label: "task-run-id", default: /N\\A/},
            clusterId: {label: "cluster", default: /N\\A/},
            startTime: {label: "run-start-time", default: /-/},
            endTime: {label: "run-end-time", default: /-/},
            duration: {label: "run-duration", default: /-/},
            status: {label: "run-status", default: /Synchronizing/},
        };
        /* eslint-enable @typescript-eslint/naming-convention */

        // wait for job to get a task id
        await browser.waitUntil(
            async () =>
                (
                    await browser.getTextByLabel(
                        labelToDefaults.taskRunId.label
                    )
                ).match(labelToDefaults.taskRunId.default) === null,
            {
                timeoutMsg: "Job did not start",
            }
        );

        expect(
            await browser.getTextByLabel(labelToDefaults.startTime.label)
        ).not.toHaveText(labelToDefaults.startTime.default);

        await browser.waitUntil(
            async () =>
                (
                    await browser.getTextByLabel(labelToDefaults.status.label)
                ).match(/Succeeded/) !== null,
            {
                timeout: 30000,
                interval: 100,
                timeoutMsg: "Job did not reach succeeded status after 30s.",
            }
        );

        const iframe = browser.$("#frame");
        browser.switchToFrame(iframe);

        const iframeRoot = await browser.$("html");
        expect(iframeRoot).toHaveTextContaining(/a\/b c$/);

        browser.switchToParentFrame();
        webView.close();
    });

    it("should run a jupyter notebook as a job on a cluster", async () => {
        await startSyncIfStopped();
        await waitForSyncComplete();

        const workbench = await driver.getWorkbench();
        const editorView = workbench.getEditorView();
        await editorView.closeAllEditors();

        // open file
        const input = await workbench.openCommandPrompt();
        await sleep(200);
        await input.setText("notebook_ipynb.ipynb");
        await input.confirm();
        await sleep(500);

        // run file
        await workbench.executeQuickPick(
            "Databricks: Run File as Workflow on Databricks"
        );

        await dismissNotifications();
        const webView = await workbench.getWebviewByTitle(/Databricks Job Run/);
        await webView.open();

        /* eslint-disable @typescript-eslint/naming-convention */
        const labelToDefaults = {
            taskRunId: {label: "task-run-id", default: /N\\A/},
            clusterId: {label: "cluster", default: /N\\A/},
            startTime: {label: "run-start-time", default: /-/},
            endTime: {label: "run-end-time", default: /-/},
            duration: {label: "run-duration", default: /-/},
            status: {label: "run-status", default: /Synchronizing/},
        };
        /* eslint-enable @typescript-eslint/naming-convention */

        // wait for job to get a task id
        await browser.waitUntil(
            async () =>
                (
                    await browser.getTextByLabel(
                        labelToDefaults.taskRunId.label
                    )
                ).match(labelToDefaults.taskRunId.default) === null,
            {
                timeoutMsg: "Job did not start",
            }
        );

        expect(
            await browser.getTextByLabel(labelToDefaults.startTime.label)
        ).not.toHaveText(labelToDefaults.startTime.default);

        await browser.waitUntil(
            async () =>
                (
                    await browser.getTextByLabel(labelToDefaults.status.label)
                ).match(/Succeeded/) !== null,
            {
                timeout: 30000,
                interval: 100,
                timeoutMsg: "Job did not reach succeeded status after 30s.",
            }
        );

        webView.close();
    });
    it("should run a python file as a job on a cluster", async () => {
        await startSyncIfStopped();
        await waitForSyncComplete();

        const workbench = await driver.getWorkbench();
        const editorView = workbench.getEditorView();
        await editorView.closeAllEditors();

        // open file
        const input = await workbench.openCommandPrompt();
        await sleep(200);
        await input.setText("file.py");
        await input.confirm();
        await sleep(500);

        // run file
        await workbench.executeQuickPick(
            "Databricks: Run File as Workflow on Databricks"
        );

        await dismissNotifications();
        const webView = await workbench.getWebviewByTitle(/Databricks Job Run/);
        await webView.open();

        /* eslint-disable @typescript-eslint/naming-convention */
        const labelToDefaults = {
            taskRunId: {label: "task-run-id", default: /N\\A/},
            clusterId: {label: "cluster", default: /N\\A/},
            startTime: {label: "run-start-time", default: /-/},
            endTime: {label: "run-end-time", default: /-/},
            duration: {label: "run-duration", default: /-/},
            status: {label: "run-status", default: /Synchronizing/},
        };
        /* eslint-enable @typescript-eslint/naming-convention */

        // wait for job to get a task id
        await browser.waitUntil(
            async () =>
                (
                    await browser.getTextByLabel(
                        labelToDefaults.taskRunId.label
                    )
                ).match(labelToDefaults.taskRunId.default) === null,
            {
                timeoutMsg: "Job did not start",
            }
        );

        expect(
            await browser.getTextByLabel(labelToDefaults.startTime.label)
        ).not.toHaveText(labelToDefaults.startTime.default);

        await browser.waitUntil(
            async () =>
                (
                    await browser.getTextByLabel(labelToDefaults.status.label)
                ).includes("Succeeded"),
            {
                timeout: 30000,
                interval: 100,
                timeoutMsg: "Job did not reach succeeded status after 30s.",
            }
        );

        webView.close();
    });

    after(async () => {
        try {
            await fs.rm(path.join(projectDir, ".vscode"), {
                recursive: true,
                force: true,
            });
        } catch {}
    });
});
