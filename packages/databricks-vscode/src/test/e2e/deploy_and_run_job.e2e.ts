import assert from "node:assert";
import {
    dismissNotifications,
    getUniqueResourceName,
    getViewSection,
    waitForLogin,
    waitForTreeItems,
} from "./utils/commonUtils.ts";
import {CustomTreeSection, Workbench} from "wdio-vscode-service";
import {
    getBasicBundleConfig,
    getSimpleJobsResource,
    writeRootBundleConfig,
} from "./utils/dabsFixtures.ts";
import path from "node:path";
import fs from "fs/promises";
import {BundleSchema} from "../../bundle/types.ts";
import {getJobViewItem} from "./utils/dabsExplorerUtils.ts";
import {fileURLToPath} from "url";

/* eslint-disable @typescript-eslint/naming-convention */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/* eslint-enable @typescript-eslint/naming-convention */

describe("Deploy and run job", async function () {
    let workbench: Workbench;
    let resourceExplorerView: CustomTreeSection;
    let vscodeWorkspaceRoot: string;
    let jobName: string;
    let clusterId: string;

    this.timeout(3 * 60 * 1000);

    async function createProjectWithJob() {
        /**
         * process.env.WORKSPACE_PATH (cwd)
         *  ├── databricks.yml
         *  └── src
         *    └── notebook.ipynb
         */

        const projectName = getUniqueResourceName("deploy_and_run_job");
        const notebookTaskName = getUniqueResourceName("notebook_task");
        /* eslint-disable @typescript-eslint/naming-convention */
        const jobDef = getSimpleJobsResource({
            tasks: [
                {
                    task_key: notebookTaskName,
                    notebook_task: {
                        notebook_path: "src/notebook.ipynb",
                    },
                    existing_cluster_id: clusterId,
                },
            ],
        });
        jobName = jobDef.name!;

        const schemaDef: BundleSchema = getBasicBundleConfig({
            bundle: {
                name: projectName,
                deployment: {},
            },
            targets: {
                dev_test: {
                    resources: {
                        jobs: {
                            vscode_integration_test: jobDef,
                        },
                    },
                },
            },
        });
        /* eslint-enable @typescript-eslint/naming-convention */

        await writeRootBundleConfig(schemaDef, vscodeWorkspaceRoot);

        await fs.mkdir(path.join(vscodeWorkspaceRoot, "src"), {
            recursive: true,
        });
        await fs.copyFile(
            path.join(__dirname, "resources", "spark_select_1.ipynb"),
            path.join(vscodeWorkspaceRoot, "src", "notebook.ipynb")
        );
    }

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
        await createProjectWithJob();
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
        await outputView.selectChannel("Databricks Bundle Logs");
        await outputView.clearText();

        const jobItem = await getJobViewItem(resourceExplorerView, jobName);
        assert(jobItem, `Job ${jobName} not found in resource explorer`);

        const deployAndRunButton = await jobItem.getActionButton(
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
                const jobItem = await getJobViewItem(
                    resourceExplorerView,
                    jobName
                );
                if (jobItem === undefined) {
                    return false;
                }

                const runStatusItem = await jobItem.findChildItem("Run Status");
                if (runStatusItem === undefined) {
                    return false;
                }

                return (await runStatusItem.getDescription()) === "Success";
            },
            {
                timeout: 120_000,
                interval: 2_000,
                timeoutMsg:
                    "The run status didn't reach success within 120 seconds",
            }
        );
    });
});
