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
                "databricks.sync.destinationType": "repo [deprecated]",
            })
        );

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
        await fs.mkdir(path.join(projectDir, "nested"), {recursive: true});
        await fs.writeFile(
            path.join(projectDir, "nested", "hello.py"),
            [`from lib import func`, "func(spark)"].join("\n")
        );

        await fs.writeFile(
            path.join(projectDir, "lib.py"),
            [
                "def func(spark):",
                `\tspark.sql('SELECT "hello world"').show()`,
            ].join("\n")
        );
        await dismissNotifications();
    });

    it("should connect to Databricks", async () => {
        const section = await getViewSection("CONFIGURATION");
        assert(section);
        await waitForTreeItems(section);
    });

    it("should start syncing", async () => {
        await (
            await driver.getWorkbench()
        ).executeCommand("Databricks: Start synchronization (full sync)");
        await startSyncIfStopped();
        await waitForSyncComplete();
    });

    it("should run a python file on a cluster", async () => {
        const workbench = await driver.getWorkbench();
        const editorView = workbench.getEditorView();
        await editorView.closeAllEditors();

        // open file
        const input = await workbench.openCommandPrompt();
        await sleep(1000);
        await input.setText("hello.py");
        await input.confirm();
        await sleep(1000);

        // run file
        await workbench.executeQuickPick("Databricks: Run File on Databricks");

        const debugOutput = await workbench
            .getBottomBar()
            .openDebugConsoleView();

        while (true) {
            // dismiss by message
            await dismissNotifications();
            await sleep(2000);
            const text = await (await debugOutput.elem).getHTML();
            if (text && text.includes("hello world")) {
                break;
            }
        }
    });

    after(async () => {
        try {
            await fs.rm(path.join(projectDir, ".vscode"), {
                force: true,
            });
        } catch {}
    });
});
