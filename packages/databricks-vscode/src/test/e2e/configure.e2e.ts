import assert from "node:assert";
import path from "node:path";
import * as fs from "fs/promises";
import {
    dismissNotifications,
    getViewSection,
    waitForTreeItems,
} from "./utils.ts";
import {
    CustomTreeSection,
    InputBox,
    sleep,
    TreeItem,
    Workbench,
} from "wdio-vscode-service";
import {expect} from "chai";
import * as YAML from "yaml";

describe("Configure Databricks Extension", async function () {
    // this will be populated by the tests
    let clusterId: string;
    let projectDir: string;
    let host: string;
    let workbench: Workbench;

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
        projectDir = process.env.WORKSPACE_PATH;
        host = process.env.DATABRICKS_HOST;
        workbench = await browser.getWorkbench();
        await dismissNotifications();
    });

    it("should open VSCode", async function () {
        const title = await workbench.getTitleBar().getTitle();
        assert(title.indexOf("[Extension Development Host]") >= 0);
    });

    it("should dismiss notifications", async function () {
        //Collect all notifications
        sleep(2000);
        const notifications = await workbench.getNotifications();
        for (const n of notifications) {
            await n.dismiss();
        }
    });

    it("should wait for quickstart", async () => {
        const section = await getViewSection("CONFIGURATION");
        assert(section);
        const welcome = await section.findWelcomeContent();
        assert(welcome);
        await browser.waitUntil(
            async () => {
                return (
                    (
                        await (
                            await workbench.getEditorView().getEditorGroup(0)
                        ).getOpenTabs()
                    ).findIndex(async (value) => {
                        return (await value.getTitle()).includes(
                            "DATABRICKS.quickstart.md"
                        );
                    }) !== -1
                );
            },
            {timeout: 5000}
        );

        //Wait for quickstart text to be visible.
        sleep(2000);
    });

    it("should open databricks panel and login", async function () {
        const section = await getViewSection("CONFIGURATION");
        assert(section);
        const welcome = await section.findWelcomeContent();
        assert(welcome);
        const buttons = await welcome.getButtons();
        assert(buttons);
        assert(buttons.length > 0);

        let input: InputBox | undefined;
        await browser.waitUntil(
            async () => {
                await (await buttons[0].elem).click();

                input = await new InputBox(workbench.locatorMap).wait();
                return input !== undefined;
            },
            {timeout: 3000, interval: 500}
        );

        assert(input !== undefined);
        while (await input.hasProgress()) {
            await sleep(500);
        }

        await input.confirm();
        await sleep(1000);

        input = await new InputBox(workbench.locatorMap).wait();
        while (await input.hasProgress()) {
            await sleep(500);
        }

        await input.selectQuickPick("DEFAULT");

        assert(await waitForTreeItems(section, 10_000));
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

        const configureButton = buttons.filter((b) => {
            return b.getLabel() === "Configure cluster";
        })[0];
        assert(configureButton);

        await configureButton.elem.click();

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

        const testClusterId = clusterProps["Cluster ID"];
        assert.equal(testClusterId, clusterId);
    });

    it("should write the project config file", async function () {
        const projectConfig = JSON.parse(
            await fs.readFile(
                path.join(projectDir, ".databricks", "project.json"),
                "utf-8"
            )
        );

        const expectedHost = new URL(
            host.startsWith("https") ? host : `https://${host}`
        ).toString();

        expect(projectConfig).to.include({
            host: expectedHost,
            authType: "profile",
            profile: "DEFAULT",
        });

        const yamlConfig = YAML.parse(
            await fs.readFile(
                path.join(projectDir, ".databricks", "databricks.yaml"),
                "utf-8"
            )
        );

        expect(yamlConfig).to.have.key("environments");
        const environment: any = Object.entries(yamlConfig.environments)[0][1];
        /* eslint-disable @typescript-eslint/naming-convention */
        expect(environment).to.include({
            compute_id: clusterId,
            mode: "development",
        });
        expect(environment.workspace).to.include({
            host: expectedHost,
        });
        expect(environment.workspace).to.have.any.keys("root_path");
        /* eslint-enable @typescript-eslint/naming-convention */
    });
});
