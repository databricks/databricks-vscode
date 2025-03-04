import path from "node:path";
import * as fs from "fs/promises";
import assert from "node:assert";
import {
    dismissNotifications,
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
            const descPath = path.normalize(desc!);
            console.log("Local Folder description:", descPath);
            if (descPath.includes(folder)) {
                return item;
            }
        }
    }
    return undefined;
}

describe("Bundle in a sub folder", async function () {
    this.timeout(3 * 60 * 1000);

    const folders = ["nested1", path.normalize("double/nested2")];
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
                const chooseProjectButton = await browser.waitUntil(
                    async () => {
                        const welcome = await section!.findWelcomeContent();
                        const buttons = await welcome!.getButtons();
                        for (const button of buttons) {
                            const title = await button.getTitle();
                            if (title === "Choose a project") {
                                return button;
                            }
                        }
                    }
                );
                assert(
                    chooseProjectButton,
                    "'Choose a project' button doesn't exist"
                );
                await chooseProjectButton.elem.click();
            } else {
                console.log(
                    "Selecting Databricks Project Folder though a tree item command"
                );
                await dismissNotifications();
                const localFolderItem = await getLocalFolderTreeItem("nested1");
                await localFolderItem!.select();
            }

            const subFoldersInput = await waitForInput();
            assert.ok(
                await subFoldersInput.findQuickPick(folder),
                `Quick pick for ${folder} not found`
            );
            await subFoldersInput.selectQuickPick(folder);

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
                        "Jobs",
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
