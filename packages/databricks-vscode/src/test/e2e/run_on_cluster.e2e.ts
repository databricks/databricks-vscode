import path from "node:path";
import * as fs from "fs/promises";
import assert from "node:assert";
import {
    dismissNotifications,
    getViewSection,
    startSyncIfStopped,
    waitForSyncComplete,
    waitForTreeItems,
} from "./utils";
import {sleep} from "wdio-vscode-service";

describe("Run python on cluster", async function () {
    let projectDir: string;
    this.timeout(3 * 60 * 1000);

    before(async () => {
        assert(process.env.DATABRICKS_HOST);
        assert(process.env.TEST_DEFAULT_CLUSTER_ID);
        assert(process.env.TEST_REPO_PATH);
        assert(process.env.WORKSPACE_PATH);
        projectDir = process.env.WORKSPACE_PATH;

        await fs.mkdir(path.join(projectDir, ".databricks"));

        await fs.writeFile(
            path.join(projectDir, ".databricks", "project.json"),
            JSON.stringify({
                host: process.env["DATABRICKS_HOST"],
                authType: "profile",
                profile: "DEFAULT",
                clusterId: process.env["TEST_DEFAULT_CLUSTER_ID"],
                workspacePath: process.env["TEST_REPO_PATH"],
            })
        );
        await fs.writeFile(
            path.join(projectDir, "hello.py"),
            `spark.sql('SELECT "hello world"').show()`
        );
        await dismissNotifications();
    });

    it("should connect to Databricks", async () => {
        const section = await getViewSection("CONFIGURATION");
        assert(section);
        await waitForTreeItems(section);
    });

    it("should start syncing", async () => {
        await startSyncIfStopped();
        await waitForSyncComplete();
    });

    it("should run a python file on a cluster", async () => {
        const workbench = await driver.getWorkbench();
        const editorView = workbench.getEditorView();
        await editorView.closeAllEditors();

        // open file
        const input = await workbench.openCommandPrompt();
        await sleep(200);
        await input.setText("hello.py");
        await input.confirm();
        await sleep(500);

        // run file
        await workbench.executeQuickPick("Databricks: Run File on Databricks");

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
});
