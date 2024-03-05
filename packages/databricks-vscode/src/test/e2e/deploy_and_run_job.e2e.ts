import assert from "node:assert";
import {
    dismissNotifications,
    getViewSection,
    waitForLogin,
    waitForTreeItems,
} from "./utils/commonUtils.ts";
import {CustomTreeSection, Workbench} from "wdio-vscode-service";
import {getSimpleJobsResource} from "./utils/dabsFixtures.ts";
import path from "node:path";
import fs from "node:fs";
import {BundleSchema} from "../../bundle/BundleSchema";
import yaml from "yaml";
import {randomUUID} from "node:crypto";
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

    function createProject() {
        /**
         * process.env.WORKSPACE_PATH (cwd)
         *  ├── databricks.yml
         *  └── src
         *    └── notebook.ipynb
         */
        const projectName = `vscode_integration_test_${randomUUID().slice(
            0,
            8
        )}`;
        vscodeWorkspaceRoot = process.env.WORKSPACE_PATH!;

        const notebookTaskName = `notebook_task_${randomUUID().slice(0, 8)}`;
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

        const schemaDef: BundleSchema = {
            bundle: {
                name: projectName,
            },
            targets: {
                test: {
                    mode: "development",
                    default: true,
                    resources: {
                        jobs: {
                            vscode_integration_test: jobDef,
                        },
                    },
                    workspace: {
                        host: process.env.DATABRICKS_HOST,
                    },
                },
            },
        };
        /* eslint-enable @typescript-eslint/naming-convention */

        fs.writeFileSync(
            path.join(vscodeWorkspaceRoot, "databricks.yml"),
            yaml.stringify(schemaDef)
        );

        fs.mkdirSync(path.join(vscodeWorkspaceRoot, "src"), {recursive: true});
        fs.copyFileSync(
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
        createProject();
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
        const section = await getViewSection("DABS RESOURCE EXPLORER");
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
                const outputView = await workbench
                    .getBottomBar()
                    .openOutputView();
                await outputView.selectChannel("Databricks Bundle Logs");
                const logs = (await outputView.getText()).join("");
                console.log("logs", logs);
                return (
                    logs.includes("Bundle deployed successfully") &&
                    logs.includes("Bundle configuration refreshed")
                );
            },
            {
                timeout: 30_000,
                interval: 2_000,
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
