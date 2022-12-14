import path from "node:path";
import * as fs from "fs/promises";
import assert from "node:assert";
import {getViewSection, getViewSubSection, waitForTreeItems} from "./utils";
import {sleep} from "wdio-vscode-service";

describe("Run python on cluster", () => {
    let projectDir: string;

    before(async () => {
        assert(process.env.TEST_DEFAULT_CLUSTER_ID);
        assert(process.env.TEST_REPO_PATH);
        assert(process.env.WORKSPACE_PATH);
        projectDir = process.env.WORKSPACE_PATH;

        await fs.mkdir(path.join(projectDir, ".databricks"));

        await fs.writeFile(
            path.join(projectDir, ".databricks", "project.json"),
            JSON.stringify({
                clusterId: process.env["TEST_DEFAULT_CLUSTER_ID"],
                profile: "DEFAULT",
                workspacePath: process.env["TEST_REPO_PATH"],
            })
        );
        await fs.writeFile(
            path.join(projectDir, "hello.py"),
            `spark.sql('SELECT "hello world"').show()`
        );

        await fs.writeFile(
            path.join(projectDir, "notebook.py"),
            [
                "# Databricks notebook source",
                `spark.sql('SELECT "hello world"').show()`,
            ].join("\n")
        );
    });

    it("should connect to Databricks", async () => {
        const section = await getViewSection("CONFIGURATION");
        assert(section);
        await waitForTreeItems(section);
    });

    it("should start syncing", async () => {
        const section = await getViewSection("CLUSTERS");
        await section?.collapse();

        const repoConfigItem = await getViewSubSection("CONFIGURATION", "Repo");
        assert(repoConfigItem);
        const buttons = await repoConfigItem.getActionButtons();
        await buttons[0].elem.click();

        // wait for sync to finish
        const workbench = await driver.getWorkbench();
        const terminalView = await workbench.getBottomBar().openTerminalView();

        while (true) {
            await sleep(500);
            const text = await terminalView.getText();
            if (text.includes("Sync Complete")) {
                break;
            }
        }
    });

    it("should run a python notebook on a cluster", async () => {
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

        Object.keys(labelToDefaults).forEach(async (key) => {
            await expect($(`aria/${labelToDefaults[key].label}`)).toHaveText(
                labelToDefaults[key].default
            );
        });

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
                timeout: 20000,
                interval: 50,
                timeoutMsg: "Job did not reach succeeded status after 20s.",
            }
        );

        Object.keys(labelToDefaults).forEach(async (key) => {
            await expect(
                $(`aria/${labelToDefaults[key].label}`)
            ).not.toHaveText(labelToDefaults[key].default);
        });

        webView.close();
    });
});
