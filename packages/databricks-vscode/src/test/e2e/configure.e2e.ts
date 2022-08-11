import assert from "node:assert";
import path from "node:path";
import * as fs from "fs/promises";
import * as tmp from "tmp-promise";
import {
    VSBrowser,
    WebDriver,
    InputBox,
    Workbench,
    TreeItem,
    ContextMenu,
    CustomTreeSection,
} from "vscode-extension-tester";
import {getViewSection, openFolder, waitForTreeItems} from "./utils";

describe("Configure Databricks Extension", function () {
    // these will be populated by the before() function
    let browser: VSBrowser;
    let driver: WebDriver;
    let projectDir: string;
    let cleanup: () => void;

    // this will be populated by the tests
    let clusterId: string;

    this.timeout(10 * 60 * 1000);

    before(async () => {
        browser = VSBrowser.instance;
        driver = browser.driver;

        assert(process.env.TEST_DEFAULT_CLUSTER_ID);
        clusterId = process.env.TEST_DEFAULT_CLUSTER_ID;

        ({path: projectDir, cleanup} = await tmp.dir());
        await openFolder(browser, projectDir);
    });

    after(() => {
        cleanup();
    });

    it("should open VSCode", async () => {
        const title = await driver.getTitle();
        assert(title.indexOf("Get Started") >= 0);
    });

    it("should open databricks panel and login", async () => {
        const section = await getViewSection("Configuration");
        assert(section);
        const welcome = await section.findWelcomeContent();
        assert(welcome);
        const buttons = await welcome.getButtons();
        assert(buttons);
        assert(buttons.length > 0);
        await buttons[0].click();

        const input = await InputBox.create();
        await input.selectQuickPick(1);

        assert(await waitForTreeItems(section));
    });

    it("should dismiss notifications", async () => {
        const notifications = await new Workbench().getNotifications();
        for (const n of notifications) {
            await n.dismiss();
        }
    });

    it("shoult list clusters", async () => {
        const section = await getViewSection("Clusters");
        assert(section);
        const tree = section as CustomTreeSection;

        assert(await waitForTreeItems(tree));

        const items = await tree.getVisibleItems();
        const labels = await Promise.all(items.map((item) => item.getLabel()));
        assert(labels.length > 0);
    });

    // test is skipped because context menus currently don't work in vscode-extension-tester
    // https://github.com/redhat-developer/vscode-extension-tester/issues/444
    it.skip("should filter clusters", async () => {
        const section = await getViewSection("Clusters");
        assert(section);
        const action = await section!.getAction("Filter clusters ...");
        assert(action);

        await action.click();
        const menu = new ContextMenu(new Workbench());
        let item = await menu.getItem("Created by me");
        await item?.click();

        const items = await section.getVisibleItems();
        assert(items.length > 0);
    });

    it("should attach cluster", async () => {
        const config = await getViewSection("Configuration");
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
        await buttons[0].click();

        const input = await InputBox.create();
        while (await input.hasProgress()) {
            await driver.sleep(200);
        }

        await input.setText(clusterId);
        await input.confirm();
        await input.selectQuickPick(0);

        // get cluster ID
        const clusterPropsItems = await clusterConfigItem.getChildren();
        const clusterProps: Record<string, string> = {};
        for (const i of clusterPropsItems) {
            clusterProps[await i.getLabel()] = (await i.getDescription()) || "";
        }

        // store cluster ID in test suite scope
        clusterId = clusterProps["Cluster ID:"];
        assert(clusterId);
    });

    it("should write the project config file", async () => {
        let projectConfig = JSON.parse(
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
