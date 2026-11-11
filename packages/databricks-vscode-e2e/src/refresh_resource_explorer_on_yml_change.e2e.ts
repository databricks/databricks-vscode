import assert from "assert";
import { CustomTreeSection } from "wdio-vscode-service";
import {
    createProjectWithJob,
    getBasicBundleConfig,
    writeRootBundleConfig,
} from "./utils/bundle-fixtures.ts";
import { waitForLogin } from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { geTaskViewItem, getResourceViewItem, RESOURCES } from "./utils/explorer.ts";
import { getViewSection } from "./utils/view.ts";

/*
 * Ported from the frozen suite. The imports differ, and so does one
 * precondition: this harness doesn't set DATABRICKS_HOST, and the fixtures
 * take the host from the [DEFAULT] profile instead.
 */
describe("Automatically refresh the bundle's resources", async function () {
    let vscodeWorkspaceRoot: string;
    let projectName: string;
    let resourceExplorerView: CustomTreeSection;
    let clusterId: string;

    this.timeout(3 * 60 * 1000);

    before(async function () {
        assert(
            process.env.TEST_DEFAULT_CLUSTER_ID,
            "TEST_DEFAULT_CLUSTER_ID env var doesn't exist",
        );
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH env var doesn't exist");

        clusterId = process.env.TEST_DEFAULT_CLUSTER_ID;
        vscodeWorkspaceRoot = process.env.WORKSPACE_PATH!;

        const basicBundleConfig = getBasicBundleConfig();
        projectName = (basicBundleConfig.bundle as { name: string }).name;

        await writeRootBundleConfig(basicBundleConfig, vscodeWorkspaceRoot);
        await dismissNotifications();
    });

    it("should wait for extension activation", async () => {
        const section = await getViewSection("PROJECT");
        assert(section);
    });

    it("should wait for connection", async () => {
        await waitForLogin("DEFAULT");
        // Drain any post-login notifications so a lingering toast can't overlay
        // the Output-channel dropdown we click below (mirrors deploy_and_run_job).
        await dismissNotifications();
    });

    it("should find the bundle's resources in the Project view", async function () {
        const section = await getViewSection("PROJECT");
        assert(section);
        resourceExplorerView = section as CustomTreeSection;
    });

    it("should pickup changes to jobs resource", async function () {
        await resourceExplorerView.expand();
        // An empty bundle has no Resources group in the PROJECT view.
        const projectItems = await resourceExplorerView.getVisibleItems();
        const labels = await Promise.all(projectItems.map((i) => i.getLabel()));
        assert(
            !labels.includes(RESOURCES),
            `Resources should be missing from an empty bundle, found (${labels.join(", ")})`,
        );

        const outputView = await (await browser.getWorkbench()).getBottomBar().openOutputView();
        // A late notification toast can overlay the channel <select> and
        // intercept the click. Re-dismiss and retry rather than failing on the
        // first interception.
        await browser.waitUntil(
            async () => {
                try {
                    await outputView.selectChannel("Databricks Bundle Logs");
                    return true;
                } catch {
                    await dismissNotifications();
                    return false;
                }
            },
            {
                timeout: 20_000,
                interval: 2_000,
                timeoutMsg: "Could not select the 'Databricks Bundle Logs' output channel",
            },
        );

        const jobDef = await createProjectWithJob(projectName, vscodeWorkspaceRoot, clusterId);

        await browser.waitUntil(
            async () => {
                const job = await getResourceViewItem(resourceExplorerView, "Jobs", jobDef.name!);
                return job !== undefined;
            },
            {
                timeout: 20_000,
                interval: 2_000,
                timeoutMsg: `Job view item with name ${jobDef.name} not found`,
            },
        );

        for (const task of jobDef.tasks!) {
            assert(
                await geTaskViewItem(resourceExplorerView, jobDef.name!, task.task_key as string),
                `Task view item with name ${task.task_key as string} not found`,
            );
        }
    });
});
