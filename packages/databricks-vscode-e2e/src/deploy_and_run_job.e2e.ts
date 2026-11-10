import assert from "node:assert";
import type { CustomTreeSection, Workbench } from "wdio-vscode-service";
import { createProjectWithJob, getUniqueResourceName } from "./utils/bundle-fixtures.ts";
import { getActionButton } from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import {
    getResourceViewItem,
    waitForBundleExplorer,
    waitForDeployment,
    waitForRunStatus,
} from "./utils/explorer.ts";

/*
 * Ported from the frozen suite. The imports differ (the helpers live in
 * several files here), and the DATABRICKS_HOST precondition is dropped,
 * because this harness doesn't set it and the fixtures take the host from
 * the [DEFAULT] profile.
 */
describe("Deploy and run job", async function () {
    let workbench: Workbench;
    let resourceExplorerView: CustomTreeSection;
    let jobName: string;

    this.timeout(3 * 60 * 1000);

    before(async function () {
        assert(
            process.env.TEST_DEFAULT_CLUSTER_ID,
            "TEST_DEFAULT_CLUSTER_ID env var doesn't exist",
        );
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH env var doesn't exist");

        workbench = await browser.getWorkbench();
        jobName = (
            await createProjectWithJob(
                getUniqueResourceName("deploy_and_run_job"),
                process.env.WORKSPACE_PATH,
                process.env.TEST_DEFAULT_CLUSTER_ID,
            )
        ).name!;
        await dismissNotifications();
    });

    it("should wait for the bundle's resources in the Project view", async () => {
        resourceExplorerView = await waitForBundleExplorer();
    });

    it("should deploy and run the current job", async () => {
        const outputView = await workbench.getBottomBar().openOutputView();
        await outputView.selectChannel("Databricks Bundle Logs");
        await outputView.clearText();

        const jobItem = await getResourceViewItem(resourceExplorerView, "Jobs", jobName);
        assert(jobItem, `Job ${jobName} not found in resource explorer`);

        await jobItem.elem.moveTo();
        const deployAndRunButton = await getActionButton(
            jobItem,
            "Deploy the bundle and run the job",
        );
        assert(deployAndRunButton, "Deploy and run button not found");
        await deployAndRunButton.click();

        await waitForDeployment();

        await waitForRunStatus(resourceExplorerView, "Jobs", jobName, "Success");
    });
});
