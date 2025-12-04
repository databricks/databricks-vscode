import assert from "node:assert";
import {
    dismissNotifications,
    getUniqueResourceName,
    getViewSection,
    selectOutputChannel,
    waitForLogin,
    waitForTreeItems,
} from "./utils/commonUtils.ts";
import {Workbench} from "wdio-vscode-service";
import {WorkspaceClient} from "@databricks/databricks-sdk";
import {createProjectWithJob} from "./utils/dabsFixtures.ts";

describe("Deploy and destroy", async function () {
    let workbench: Workbench;
    let vscodeWorkspaceRoot: string;
    let jobName: string;
    let clusterId: string;

    this.timeout(3 * 60 * 1000);

    before(async function () {
        assert(
            process.env.TEST_DEFAULT_CLUSTER_ID,
            "TEST_DEFAULT_CLUSTER_ID env var doesn't exist"
        );
        assert(
            process.env.WORKSPACE_PATH,
            "WORKSPACE_PATH env var doesn't exist"
        );
        assert(
            process.env.DATABRICKS_HOST,
            "DATABRICKS_HOST env var doesn't exist"
        );

        clusterId = process.env.TEST_DEFAULT_CLUSTER_ID;
        workbench = await browser.getWorkbench();
        vscodeWorkspaceRoot = process.env.WORKSPACE_PATH;
        const job = await createProjectWithJob(
            getUniqueResourceName("deploy_and_destroy_bundle"),
            vscodeWorkspaceRoot,
            clusterId
        );
        jobName = job.name!;
        await dismissNotifications();
    });

    it("should wait for extension activation", async () => {
        const section = await getViewSection("CONFIGURATION");
        assert(section);
    });

    it("should wait for connection", async () => {
        await waitForLogin("DEFAULT");
        await dismissNotifications();
    });

    it("should find resource explorer view", async function () {
        const section = await getViewSection("BUNDLE RESOURCE EXPLORER");
        assert(section);
        await waitForTreeItems(section, 20_000);
    });

    it("should deploy and run the current job", async () => {
        const wsClient = new WorkspaceClient({
            configFile: process.env.DATABRICKS_CONFIG_FILE,
            profile: "DEFAULT",
        });

        const prefix = `[dev ${(await wsClient.currentUser.me()).userName
            ?.split("@")[0]
            .replaceAll(/[^a-zA-Z0-9]/g, "_")}]`;

        const outputView = await workbench.getBottomBar().openOutputView();
        await selectOutputChannel(outputView, "Databricks Bundle Logs");
        await outputView.clearText();

        await browser.executeWorkbench(async (vscode) => {
            await vscode.commands.executeCommand("databricks.bundle.deploy");
        });
        console.log("Waiting for deployment to finish");
        // Wait for the deployment to finish
        await browser.waitUntil(
            async () => {
                try {
                    await browser.executeWorkbench(async (vscode) => {
                        await vscode.commands.executeCommand(
                            "workbench.panel.output.focus"
                        );
                    });
                    const outputView = await workbench
                        .getBottomBar()
                        .openOutputView();

                    await selectOutputChannel(
                        outputView,
                        "Databricks Bundle Logs"
                    );

                    const logs = (await outputView.getText()).join("");
                    console.log(logs);
                    return (
                        logs.includes("Bundle deployed successfully") &&
                        logs.includes("Bundle configuration refreshed")
                    );
                } catch (e) {
                    return false;
                }
            },
            {
                timeout: 60_000,
                interval: 1_000,
                timeoutMsg:
                    "Can't find 'Bundle deployed successfully' message in output channel",
            }
        );

        let found = false;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const j of wsClient.jobs.list({
            name: `${prefix} ${jobName}`,
        })) {
            found = true;
        }
        assert(found, `Job ${jobName} not found in workspace`);

        await browser.executeWorkbench(async (vscode) => {
            await vscode.commands.executeCommand(
                "databricks.bundle.destroy",
                false, // Don't force it
                false // Skip the modal warning dialog, as they don't work in tests
            );
        });

        console.log("Waiting for bundle to destroy");
        // Wait for status to reach success
        await browser.waitUntil(
            async () => {
                try {
                    await browser.executeWorkbench(async (vscode) => {
                        await vscode.commands.executeCommand(
                            "workbench.panel.output.focus"
                        );
                    });
                    const outputView = await workbench
                        .getBottomBar()
                        .openOutputView();

                    await selectOutputChannel(
                        outputView,
                        "Databricks Bundle Logs"
                    );

                    const logs = (await outputView.getText()).join("");
                    console.log(logs);
                    return (
                        logs.includes("Bundle destroyed successfully") &&
                        logs.includes("Bundle configuration refreshed")
                    );
                } catch (e) {
                    return false;
                }
            },
            {
                timeout: 120_000,
                interval: 2_000,
                timeoutMsg:
                    "The run status didn't reach success within 120 seconds",
            }
        );

        found = false;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const j of wsClient.jobs.list({
            name: `${prefix} ${jobName}`,
        })) {
            found = true;
        }
        assert(!found, `Job ${jobName} still found in workspace`);
    });
});
