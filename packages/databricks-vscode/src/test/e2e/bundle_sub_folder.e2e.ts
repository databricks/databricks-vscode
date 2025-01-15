import path from "node:path";
import * as fs from "fs/promises";
import assert from "node:assert";
import {
    getUniqueResourceName,
    getViewSection,
    waitForInput,
    waitForLogin,
} from "./utils/commonUtils.ts";
import {createProjectWithJob} from "./utils/dabsFixtures.ts";
import {CustomTreeSection} from "wdio-vscode-service";
import {getResourceViewItem} from "./utils/dabsExplorerUtils.ts";

async function getLocalFolderTreeItem(folder: string) {
    const section = (await getViewSection(
        "CONFIGURATION"
    )) as CustomTreeSection;
    assert(section, "CONFIGURATION section doesn't exist");
    const items = await section.getVisibleItems();
    for (const item of items) {
        const label = await item.getLabel();
        if (label.toLowerCase().includes("local folder")) {
            const desc = await item.getDescription();
            console.log("Local Folder description:", desc);
            if (desc?.includes(folder)) {
                return item;
            }
        }
    }
    return undefined;
}

describe("Bundle in a sub folder", async function () {
    this.timeout(3 * 60 * 1000);

    const folders = ["nested1", "double/nested2"];
    const jobs = {};

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        for (const dir of folders) {
            const projectDir = path.join(process.env.WORKSPACE_PATH!, dir);
            await fs.mkdir(projectDir, {recursive: true});
            const job = await createProjectWithJob(
                getUniqueResourceName(dir),
                projectDir,
                process.env.TEST_DEFAULT_CLUSTER_ID!
            );
            jobs[dir] = job;
        }
    });

    for (const folder of folders) {
        it(`should select the sub folder ${folder} with a project`, async () => {
            if (folder === "nested1") {
                console.log(
                    "Selecting Databricks Project Folder through the welcome screen UI"
                );
                const section = await getViewSection("CONFIGURATION");
                const selectSubFolderButton = await browser.waitUntil(
                    async () => {
                        const welcome = await section!.findWelcomeContent();
                        const buttons = await welcome!.getButtons();
                        for (const button of buttons) {
                            if (
                                (await button.getTitle()) ===
                                "Select a sub-folder with a Databricks project"
                            ) {
                                return button;
                            }
                        }
                    }
                );
                assert(
                    selectSubFolderButton,
                    "'Select sub folder' button doesn't exist"
                );
                await selectSubFolderButton.elem.click();
            } else {
                console.log(
                    "Selecting Databricks Project Folder though a tree item command"
                );
                const localFolderItem = await getLocalFolderTreeItem("nested1");
                await (await localFolderItem!.elem).click();
            }

            const subFoldersInput = await waitForInput();
            const nestedProjectPick =
                await subFoldersInput.findQuickPick(folder);
            assert(
                nestedProjectPick,
                `'${folder}' project is absent in the quick pick selection`
            );
            await nestedProjectPick.select();

            await waitForLogin("DEFAULT");
        });

        it(`should show a Local Folder configuration item for ${folder}`, async () => {
            const localFolderItem = await getLocalFolderTreeItem(folder);
            assert.ok(
                localFolderItem,
                "Local Folder configuration item not found"
            );
        });

        it(`should show a job in the resource explorer for ${folder}`, async () => {
            const resourceExplorerView = (await getViewSection(
                "BUNDLE RESOURCE EXPLORER"
            )) as CustomTreeSection;
            await browser.waitUntil(
                async () => {
                    const job = await getResourceViewItem(
                        resourceExplorerView,
                        "Workflows",
                        jobs[folder].name!
                    );
                    return job !== undefined;
                },
                {
                    timeout: 20_000,
                    interval: 2_000,
                    timeoutMsg: `Job view item with name ${jobs[folder].name} not found`,
                }
            );
        });
    }
});
