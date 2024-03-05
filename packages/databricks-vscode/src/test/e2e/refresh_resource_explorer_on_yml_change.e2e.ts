import assert from "assert";
import {CustomTreeSection} from "wdio-vscode-service";
import {
    dismissNotifications,
    getViewSection,
    waitForLogin,
} from "./utils/commonUtils";
import fs from "fs";
import path from "path";
import yaml from "yaml";
import {getSimpleJobsResource} from "./utils/dabsFixtures";
import {randomUUID} from "crypto";
import {BundleSchema, BundleTarget, Resource} from "../../bundle/types";
import {geTaskViewItem, getJobViewItem} from "./utils/dabsExplorerUtils";
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
    let jobDef: Resource<BundleTarget, "jobs">;

    this.timeout(3 * 60 * 1000);

    function createSimpleProject() {
        /**
         * process.env.WORKSPACE_PATH (cwd)
         * ├── databricks.yml
         */
        const schemaDef: BundleSchema = {
            bundle: {
                name: projectName,
            },
            targets: {
                test: {
                    mode: "development",
                    workspace: {
                        host: process.env.DATABRICKS_HOST,
                    },
                },
            },
        };

        fs.writeFileSync(
            path.join(vscodeWorkspaceRoot, "databricks.yml"),
            yaml.stringify(schemaDef)
        );
    }

    function createProjectWithJob() {
        /**
         * process.env.WORKSPACE_PATH (cwd)
         *  ├── databricks.yml
         *  └── src
         *    └── notebook.ipynb
         */

        const notebookTaskName = `notebook_task_${randomUUID().slice(0, 8)}`;
        /* eslint-disable @typescript-eslint/naming-convention */
        jobDef = getSimpleJobsResource({
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

        const schemaDef: BundleSchema = {
            bundle: {
                name: projectName,
            },
            targets: {
                test: {
                    mode: "development",
                    workspace: {
                        host: process.env.DATABRICKS_HOST,
                    },
                    resources: {
                        jobs: {
                            vscode_integration_test: jobDef,
                        },
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
            path.join(__dirname, "..", "resources", "spark_select_1.ipynb"),
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
        projectName = `vscode_integration_test_${randomUUID().slice(0, 8)}`;
        vscodeWorkspaceRoot = process.env.WORKSPACE_PATH!;
        createSimpleProject();
        await dismissNotifications();
    });

    it("should wait for extension activation", async () => {
        const section = await getViewSection("CONFIGURATION");
        assert(section);
    });

    it("should wait for connection", async () => {
        await waitForLogin("DEFAULT");
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

        createProjectWithJob();

        await browser.waitUntil(
            async () => {
                const job = await getJobViewItem(
                    resourceExplorerView,
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
