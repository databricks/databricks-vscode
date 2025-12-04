import assert from "node:assert";
import {
    dismissNotifications,
    getUniqueResourceName,
    getViewSection,
    selectOutputChannel,
    waitForDeployment,
    waitForLogin,
    waitForTreeItems,
} from "./utils/commonUtils.ts";
import {CustomTreeSection, Workbench} from "wdio-vscode-service";
import {createProjectWithJob} from "./utils/dabsFixtures.ts";
import {
    getResourceViewItem,
    waitForRunStatus,
} from "./utils/dabsExplorerUtils.ts";

describe("Deploy and run job", async function () {
    let workbench: Workbench;
    let resourceExplorerView: CustomTreeSection;
    let jobName: string;

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

        workbench = await browser.getWorkbench();
        jobName = (
            await createProjectWithJob(
                getUniqueResourceName("deploy_and_run_job"),
                process.env.WORKSPACE_PATH,
                process.env.TEST_DEFAULT_CLUSTER_ID
            )
        ).name!;
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

    it("should deploy and run the current job", async () => {
        const outputView = await workbench.getBottomBar().openOutputView();
        await selectOutputChannel(outputView, "Databricks Bundle Logs");
        await outputView.clearText();

        const jobItem = await getResourceViewItem(
            resourceExplorerView,
            "Jobs",
            jobName
        );
        assert(jobItem, `Job ${jobName} not found in resource explorer`);

        const deployAndRunButton = await jobItem.getActionButton(
            "Deploy the bundle and run the job"
        );
        assert(deployAndRunButton, "Deploy and run button not found");
        await deployAndRunButton.elem.click();

        await waitForDeployment();

        await waitForRunStatus(
            resourceExplorerView,
            "Jobs",
            jobName,
            "Success"
        );
    });
});
