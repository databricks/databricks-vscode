import assert from "node:assert";
import path from "node:path";
import * as fs from "fs/promises";
import {
    getViewSection,
    waitForPythonExtension,
    waitForTreeItems,
} from "./utils";
import {
    CustomTreeSection,
    InputBox,
    sleep,
    TreeItem,
    Workbench,
} from "wdio-vscode-service";

describe("Configure Databricks Extension", async function () {
    // this will be populated by the tests
    let clusterId: string;
    let projectDir: string;
    let workbench: Workbench;

    this.timeout(5 * 60 * 1000);

    before(async function () {
        assert(
            process.env.TEST_DEFAULT_CLUSTER_ID,
            "TEST_DEFAULT_CLUSTER_ID env var doesn't exist"
        );
        assert(
            process.env.WORKSPACE_PATH,
            "WORKSPACE_PATH env var doesn't exist"
        );
        clusterId = process.env.TEST_DEFAULT_CLUSTER_ID;
        projectDir = process.env.WORKSPACE_PATH;

        workbench = await browser.getWorkbench();
        await waitForPythonExtension(3 * 60 * 1000);
    });

    it("should open VSCode", async function () {
        const title = await workbench.getTitleBar().getTitle();
        assert(title.indexOf("[Extension Development Host]") >= 0);
    });

    it("should dismiss notifications", async function () {
        const notifications = await workbench.getNotifications();
        for (const n of notifications) {
            await n.dismiss();
        }
    });

    it("should open databricks panel and login", async function () {
        const section = await getViewSection("CONFIGURATION");
        assert(section);
        const welcome = await section.findWelcomeContent();
        assert(welcome);
        const buttons = await welcome.getButtons();
        assert(buttons);
        assert(buttons.length > 0);
        await (await buttons[0].elem).click();

        const input = await new InputBox(workbench.locatorMap).wait();
        await sleep(200);

        await input.selectQuickPick(1);
        assert(await waitForTreeItems(section, 10_000));
    });

    it("shoult list clusters", async function () {
        const section = await getViewSection("CLUSTERS");
        assert(section);
        const tree = section as CustomTreeSection;

        assert(await waitForTreeItems(tree));

        const items = await tree.getVisibleItems();
        assert(items.length > 0);
    });

    it("should attach cluster", async function () {
        const config = await getViewSection("CONFIGURATION");
        assert(config);
        const configTree = config as CustomTreeSection;

        assert(await waitForTreeItems(configTree));

        const configItems = await configTree.getVisibleItems();

        let clusterConfigItem: TreeItem | undefined;
        for (const i of configItems) {
            const label = await i.getLabel();
            if (label.startsWith("Cluster")) {
                clusterConfigItem = i;
                break;
            }
        }
        assert(clusterConfigItem);

        const buttons = await (
            clusterConfigItem as TreeItem
        ).getActionButtons();
        await buttons[0].elem.click();

        const input = await new InputBox(workbench.locatorMap).wait();
        await sleep(200);

        await input.setText(clusterId);
        await sleep(500);
        await input.confirm();

        // wait for tree to update
        let clusterPropsItems;
        do {
            await sleep(200);
            clusterPropsItems = await clusterConfigItem.getChildren();
        } while (clusterPropsItems.length <= 1);

        // get cluster ID
        const clusterProps: Record<string, string> = {};
        for (const i of clusterPropsItems) {
            clusterProps[await i.getLabel()] = (await i.getDescription()) || "";
        }

        const testClusterId = clusterProps["Cluster ID:"];
        assert.equal(testClusterId, clusterId);
    });

    it("should write the project config file", async function () {
        const projectConfig = JSON.parse(
            await fs.readFile(
                path.join(projectDir, ".databricks", "project.json"),
                "utf-8"
            )
        );

        assert.deepEqual(projectConfig, {
            clusterId,
            profile: "DEFAULT",
        });
    });
});
