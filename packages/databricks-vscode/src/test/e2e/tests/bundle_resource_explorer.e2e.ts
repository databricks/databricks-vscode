import assert, {AssertionError} from "node:assert";
import {
    dismissNotifications,
    getViewSection,
    waitForLogin,
    waitForTreeItems,
} from "../utils/commonUtils.ts";
import {ViewSection, Workbench, sleep} from "wdio-vscode-service";
import {initProject} from "../utils/initUtils.ts";
import {getSimpleJobsResource} from "../utils/dabsFixtures.ts";
import path from "node:path";
import fs from "node:fs";
import {BundleSchema} from "../../../bundle/BundleSchema";
import yaml from "yaml";
import {randomUUID} from "node:crypto";
import {Config, WorkspaceClient} from "@databricks/databricks-sdk";

async function getJobViewItem(
    resourceExplorer: ViewSection,
    jobDisplayName: string
) {
    const jobs = await resourceExplorer.openItem("Workflows");
    for (const job of jobs) {
        if ((await job.elem.getText()).includes(jobDisplayName)) {
            return job;
        }
    }
}

async function geTaskViewItem(
    resourceExplorerView: ViewSection,
    jobName: string,
    taskName: string
) {
    const jobViewItem = await getJobViewItem(resourceExplorerView, jobName);
    assert(jobViewItem, `Job view item with name ${jobName} not found`);

    const tasks = await resourceExplorerView.openItem(
        "Workflows",
        await (await jobViewItem!.elem).getText(),
        "Tasks"
    );
    for (const task of tasks) {
        if ((await task.elem.getText()).includes(taskName)) {
            return task;
        }
    }
}

describe("Configure Databricks Extension", async function () {
    let workbench: Workbench;
    let resourceExplorerView: ViewSection;
    let vscodeWorkspaceRoot: string;
    let projectName: string;
    let clusterId: string;
    let workspaceApiClient: WorkspaceClient;

    // A list of .bak files that need to be restored after a test. This is drained after restoring.
    let filesToRestore: string[] = [];

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

        workspaceApiClient = new WorkspaceClient(
            new Config({
                configFile: process.env.DATABRICKS_CONFIG_FILE,
                profile: "DEFAULT",
            })
        );
        clusterId = process.env.TEST_DEFAULT_CLUSTER_ID;
        workbench = await browser.getWorkbench();
        await dismissNotifications();
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    function restoreFile(src: string) {
        const dest = `${src}.bak`;
        fs.copyFileSync(src, dest);
        filesToRestore.push(dest);
    }

    afterEach(() => {
        filesToRestore.forEach((file) => {
            fs.copyFileSync(file, file.slice(0, -4));
            fs.rmSync(file);
        });
        filesToRestore = [];
    });

    it("should wait for extension activation", async () => {
        const section = await getViewSection("CONFIGURATION");
        assert(section);
    });

    it("should initialize new project", async function () {
        ({workspaceRoot: vscodeWorkspaceRoot, projectName} =
            await initProject(workbench));
    });

    it("should wait for connection", async () => {
        await waitForLogin("DEFAULT");
    });

    it("should find resource explorer view", async function () {
        const section = await getViewSection("DABS RESOURCE EXPLORER");
        assert(section);
        await waitForTreeItems(section, 20_000);
        resourceExplorerView = section;
    });

    it("should pickup changes to jobs resource", async function () {
        const resourceYamlPath = path.join(
            vscodeWorkspaceRoot,
            "resources",
            `${projectName}_job.yml`
        );

        const notebookTaskName = `notebook_task_${randomUUID().slice(0, 8)}`;
        /* eslint-disable @typescript-eslint/naming-convention */
        const jobDef = getSimpleJobsResource({
            tasks: [
                {
                    task_key: notebookTaskName,
                    notebook_task: {
                        notebook_path: "../src/notebook.ipynb",
                    },
                    existing_cluster_id: clusterId,
                },
            ],
        });

        const schemaDef: BundleSchema = {
            resources: {
                jobs: {
                    vscode_integration_test: jobDef,
                },
            },
        };
        /* eslint-enable @typescript-eslint/naming-convention */

        fs.writeFileSync(resourceYamlPath, yaml.stringify(schemaDef));

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
        assert(
            await geTaskViewItem(
                resourceExplorerView,
                jobDef.name!,
                notebookTaskName
            )
        );
    });

    it("should deploy the current bundle", async function () {
        const outputView = await workbench.getBottomBar().openOutputView();
        await outputView.selectChannel("Databricks Bundle Logs");
        await outputView.clearText();

        browser.executeWorkbench((vscode) => {
            vscode.commands.executeCommand("databricks.bundle.deploy");
        });

        await browser.waitUntil(
            async () => {
                const logs = (await outputView.getText()).join("");
                return (
                    logs.includes("Bundle deployed successfully") &&
                    logs.includes("Bundle configuration refreshed.")
                );
            },
            {
                timeout: 30_000,
                interval: 2_000,
                timeoutMsg:
                    "Can't find 'Bundle deployed successfully' message in output channel",
            }
        );

        await sleep(2_000);
        const jobName = await (await resourceExplorerView.openItem("Workflows"))
            .at(0)
            ?.elem.getText();

        assert(jobName);
        console.log("Searching for deployed job:", jobName);

        for await (const job of workspaceApiClient.jobs.list({})) {
            if (job.settings?.name === jobName) {
                return;
            }
        }

        throw new AssertionError({
            message: `No deployed job with name ${jobName} found`,
        });
    });
});
