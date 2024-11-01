import assert from "node:assert";
import {
    dismissNotifications,
    getViewSection,
    waitForLogin,
    waitForTreeItems,
} from "./utils/commonUtils.ts";
import {CustomTreeSection, Workbench} from "wdio-vscode-service";
import {createProjectWithPipeline} from "./utils/dabsFixtures.ts";
import {getResourceViewItem} from "./utils/dabsExplorerUtils.ts";

describe("Deploy and run pipeline", async function () {
    let workbench: Workbench;
    let resourceExplorerView: CustomTreeSection;
    let pipelineName: string;

    // Long timeout, as the pipeline will be waiting for its cluster to start
    this.timeout(20 * 60 * 1000);

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

        workbench = await browser.getWorkbench();
        pipelineName = await createProjectWithPipeline(
            process.env.WORKSPACE_PATH
        );
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
        resourceExplorerView = section as CustomTreeSection;
    });

    it("should deploy and run the current pipeline", async () => {
        const outputView = await workbench.getBottomBar().openOutputView();
        await outputView.selectChannel("Databricks Bundle Logs");
        await outputView.clearText();

        const pipelineItem = await getResourceViewItem(
            resourceExplorerView,
            "Pipelines",
            pipelineName
        );
        assert(
            pipelineItem,
            `Pipeline ${pipelineName} not found in resource explorer`
        );

        const deployAndRunButton = await pipelineItem.getActionButton(
            "Deploy the bundle and run the resource"
        );
        assert(deployAndRunButton, "Deploy and run button not found");
        await deployAndRunButton.elem.click();

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

                    if (
                        (await outputView.getCurrentChannel()) !==
                        "Databricks Bundle Logs"
                    ) {
                        await outputView.selectChannel(
                            "Databricks Bundle Logs"
                        );
                    }

                    const logs = (await outputView.getText()).join("");
                    console.log("------------ Bundle Output ------------");
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

        console.log("Waiting for run to finish");
        // Wait for status to reach success
        await browser.waitUntil(
            async () => {
                const item = await getResourceViewItem(
                    resourceExplorerView,
                    "Pipelines",
                    pipelineName
                );
                if (item === undefined) {
                    console.log(`Item ${pipelineName} not found`);
                    return false;
                }

                const runStatusItem = await item.findChildItem("Run Status");
                if (runStatusItem === undefined) {
                    console.log("Run status item not found");
                    return false;
                }

                const description = await runStatusItem.getDescription();
                console.log(`Run status: ${description}`);

                return description === "Completed";
            },
            {
                // Long 10min timeout, as the pipeline will be waiting for its cluster to start
                timeout: 600_000,
                interval: 10_000,
                timeoutMsg:
                    "The run status didn't reach success within 10 minutes",
            }
        );
    });
});
