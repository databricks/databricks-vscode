import assert from "assert";
import {CustomTreeSection} from "wdio-vscode-service";
import {
    dismissNotifications,
    getUniqueResourceName,
    getViewSection,
    waitForLogin,
} from "./utils/commonUtils.ts";
import fs from "fs/promises";
import path from "path";
import {
    createProjectWithJob,
    getBasicBundleConfig,
    getSimpleJobsResource,
    writeRootBundleConfig,
} from "./utils/dabsFixtures.ts";
import {BundleSchema, BundleTarget, Resource} from "../../bundle/types";
import {
    geTaskViewItem,
    getResourceViewItem,
} from "./utils/dabsExplorerUtils.ts";
import {fileURLToPath} from "url";

/* eslint-disable @typescript-eslint/naming-convention */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/* eslint-enable @typescript-eslint/naming-convention */

describe("Automatically refresh resource explorer", async function () {
    let vscodeWorkspaceRoot: string;
    let projectName: string;
    let resourceExplorerView: CustomTreeSection;
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
        vscodeWorkspaceRoot = process.env.WORKSPACE_PATH!;

        const basicBundleConfig = getBasicBundleConfig();
        projectName = basicBundleConfig.bundle!.name!;

        await writeRootBundleConfig(basicBundleConfig, vscodeWorkspaceRoot);
        await dismissNotifications();
    });

    it("should wait for extension activation", async () => {
        const section = await getViewSection("CONFIGURATION");
        assert(section);
    });

    it("should wait for connection", async () => {
        await waitForLogin("DEFAULT");
    });

    it("should find resource explorer view", async function () {
        const section = await getViewSection("BUNDLE RESOURCE EXPLORER");
        assert(section);
        resourceExplorerView = section as CustomTreeSection;
    });

    it("should pickup changes to jobs resource", async function () {
        await resourceExplorerView.expand();
        const resourceExplorerItems =
            await resourceExplorerView.getVisibleItems();
        assert(
            resourceExplorerItems.length === 0,
            `Resource explorer should be empty, found (${(
                await Promise.all(
                    resourceExplorerItems.map((i) => i.getLabel())
                )
            ).join(", ")})`
        );

        const outputView = await (await browser.getWorkbench())
            .getBottomBar()
            .openOutputView();
        await outputView.selectChannel("Databricks Bundle Logs");

        const jobDef = await createProjectWithJob(
            projectName,
            vscodeWorkspaceRoot,
            clusterId
        );

        await browser.waitUntil(
            async () => {
                const job = await getResourceViewItem(
                    resourceExplorerView,
                    "Workflows",
                    jobDef.name!
                );
                return job !== undefined;
            },
            {
                timeout: 20_000,
                interval: 2_000,
                timeoutMsg: `Job view item with name ${jobDef.name} not found`,
            }
        );

        for (const task of jobDef.tasks!) {
            assert(
                await geTaskViewItem(
                    resourceExplorerView,
                    jobDef.name!,
                    task.task_key!
                ),
                `Task view item with name ${task.task_key} not found`
            );
        }
    });
});
