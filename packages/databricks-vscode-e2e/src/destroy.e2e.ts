import assert from "node:assert";
import type { Workbench } from "wdio-vscode-service";
import { createProjectWithJob, getUniqueResourceName } from "./utils/bundle-fixtures.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { waitForBundleExplorer, waitForBundleOutput, waitForDeployment } from "./utils/explorer.ts";
import { WorkspaceClient } from "./utils/workspace-client.ts";

/*
 * Ported from the frozen suite. The imports differ: `WorkspaceClient` is a
 * small stand-in for the old SDK's (utils/workspace-client.ts), and the
 * DATABRICKS_HOST precondition is dropped, because this harness doesn't set
 * it and the fixtures take the host from the [DEFAULT] profile.
 */
describe("Deploy and destroy", async function () {
    let workbench: Workbench;
    let vscodeWorkspaceRoot: string;
    let jobName: string;
    let clusterId: string;

    this.timeout(3 * 60 * 1000);

    before(async function () {
        assert(
            process.env.TEST_DEFAULT_CLUSTER_ID,
            "TEST_DEFAULT_CLUSTER_ID env var doesn't exist",
        );
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH env var doesn't exist");

        clusterId = process.env.TEST_DEFAULT_CLUSTER_ID;
        workbench = await browser.getWorkbench();
        vscodeWorkspaceRoot = process.env.WORKSPACE_PATH;
        const job = await createProjectWithJob(
            getUniqueResourceName("deploy_and_destroy_bundle"),
            vscodeWorkspaceRoot,
            clusterId,
        );
        jobName = job.name!;
        await dismissNotifications();
    });

    it("should wait for the bundle's resources in the Project view", async () => {
        await waitForBundleExplorer();
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
        await outputView.selectChannel("Databricks Bundle Logs");
        await outputView.clearText();

        await browser.executeWorkbench(async (vscode) => {
            await vscode.commands.executeCommand("databricks.bundle.deploy");
        });
        await waitForDeployment();

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
                false, // Skip the modal warning dialog, as they don't work in tests
            );
        });

        console.log("Waiting for bundle to destroy");
        await waitForBundleOutput("Bundle destroyed successfully", {
            timeout: 120_000,
            interval: 2_000,
        });

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
