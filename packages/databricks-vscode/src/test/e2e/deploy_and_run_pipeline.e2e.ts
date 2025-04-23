import assert from "node:assert";
import {
    dismissNotifications,
    getViewSection,
    waitForDeployment,
    waitForLogin,
    waitForTreeItems,
} from "./utils/commonUtils.ts";
import {CustomTreeSection, TreeItem, Workbench} from "wdio-vscode-service";
import {createProjectWithPipeline} from "./utils/dabsFixtures.ts";
import {
    getResourceSubItems,
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
            "Deploy the bundle and run the pipeline"
        );
        assert(deployAndRunButton, "Deploy and run button not found");
        await deployAndRunButton.elem.click();

        await waitForDeployment();

        await waitForRunStatus(
            resourceExplorerView,
            "Pipelines",
            pipelineName,
            "Success",
            // Long timeout, as the pipeline will be waiting for its cluster to start
            15 * 60 * 1000
        );
    });

    it("should show expected run events for the sucessful run", async () => {
        const runStatusItems = await getResourceSubItems(
            resourceExplorerView,
            "Pipelines",
            pipelineName,
            "Run Status"
        );
        const labels: string[] = [];
        for (const item of runStatusItems) {
            const label = await item.getLabel();
            console.log(`Run status item: ${label}`);
            labels.push(label);
        }
        assert(labels.includes("Start Time"), "Start Time label not found");
        assert(
            labels.includes("Dataset 'test_view' defined as VIEW.") ||
                labels.includes("Dataset `test_view` defined as VIEW."),
            "test_view item not found"
        );
        assert(
            labels.includes(
                "Dataset 'test_table' defined as MATERIALIZED_VIEW."
            ) ||
                labels.includes(
                    "Dataset `test_table` defined as MATERIALIZED_VIEW."
                ),
            "test_table item not found"
        );
    });

    it("should show expected datasets after the successful run", async () => {
        const datasetItems = await getResourceSubItems(
            resourceExplorerView,
            "Pipelines",
            pipelineName,
            "Datasets"
        );
        const datasets: Array<{
            label: string;
            description?: string;
            item: TreeItem;
        }> = [];
        for (const item of datasetItems) {
            const label = await item.getLabel();
            console.log(`Dataset label: ${label}`);
            const description = await item.getDescription();
            console.log(`Dataset description: ${description}`);
            datasets.push({label, description, item});
        }
        datasets.sort((a, b) => (a.label > b.label ? 1 : -1));
        assert.strictEqual(datasets.length, 2);
        assert.strictEqual(datasets[0].label, "test_table");
        assert.strictEqual(datasets[0].description, "materialized view");
        assert.strictEqual(datasets[1].label, "test_view");
        assert.strictEqual(datasets[1].description, "view");
    });

    it("should show expected schema definitions for a dataset", async () => {
        const schemaItems = await getResourceSubItems(
            resourceExplorerView,
            "Pipelines",
            pipelineName,
            "Datasets",
            "test_table"
        );
        assert.strictEqual(schemaItems.length, 1);
        assert.strictEqual(await schemaItems[0].getLabel(), "1");
        assert.strictEqual(await schemaItems[0].getDescription(), "integer");
    });
});
