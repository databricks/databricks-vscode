import assert from "node:assert";
import {
    dismissNotifications,
    getViewSection,
    waitForDeployment,
    waitForLogin,
    waitForTreeItems,
} from "./utils/commonUtils.ts";
import {CustomTreeSection, Workbench} from "wdio-vscode-service";
import {createProjectWithPipeline} from "./utils/dabsFixtures.ts";
import {
    getResourceViewItem,
    waitForRunStatus,
} from "./utils/dabsExplorerUtils.ts";

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

        await waitForDeployment();

        await waitForRunStatus(
            resourceExplorerView,
            "Pipelines",
            pipelineName,
            // TODO: the account we are using to run tests doesn't have permissions to create clusters for the pipelines
            "Failed",
            // Long timeout, as the pipeline will be waiting for its cluster to start
            15 * 60 * 1000
        );
    });
});
