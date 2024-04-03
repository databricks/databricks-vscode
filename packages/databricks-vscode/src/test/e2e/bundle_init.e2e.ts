import assert from "node:assert";
import {
    dismissNotifications,
    getTabByTitle,
    getUniqueResourceName,
    getViewSection,
    waitForInput,
    waitForLogin,
    waitForTreeItems,
} from "./utils/commonUtils.ts";
import {Workbench, sleep} from "wdio-vscode-service";
import {tmpdir} from "os";
import {Key} from "webdriverio";

describe("Bundle Init", async function () {
    let workbench: Workbench;
    let vscodeWorkspaceRoot: string;
    let projectName: string;

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
        workbench = await browser.getWorkbench();
        await dismissNotifications();
    });

    it("should wait for extension activation", async () => {
        const section = await getViewSection("CONFIGURATION");
        assert(section);
    });

    it("should initialize new project", async function () {
        await browser.executeWorkbench((vscode) => {
            vscode.commands.executeCommand("databricks.bundle.initNewProject");
        });

        projectName = getUniqueResourceName("init_test");

        const hostSelectionInput = await waitForInput();
        await hostSelectionInput.confirm();

        await sleep(1000);

        const profileSelectionInput = await waitForInput();
        await profileSelectionInput.selectQuickPick("DEFAULT");

        const parentDir = tmpdir();
        const parentFolderInput = await waitForInput();
        // Type in the parentDir value to the input
        await browser.keys(parentDir.split(""));
        await sleep(1000);
        const picks = await parentFolderInput.getQuickPicks();
        const pick = picks.filter((p) => p.getIndex() === 0)[0];
        assert(pick, "Parent folder quick pick doesn't have any items");
        expect(await pick.getLabel()).toBe(parentDir);
        await pick.select();

        // Wait for the databricks cli terminal window to pop up and select all
        // default options for the default template
        const editorView = workbench.getEditorView();
        const title = "Databricks Project Init";
        const initTab = await getTabByTitle(title);
        assert(initTab, "Can't find a tab for project-init terminal wizard");
        await initTab.select();

        //select temaplate type
        await browser.keys("default-python".split(""));
        await sleep(1000);
        await browser.keys([Key.Enter]);
        //enter project name temaplate type
        await browser.keys(projectName.split(""));
        await sleep(1000);
        await browser.keys([Key.Enter]);
        await browser.waitUntil(
            async () => {
                const activeTab = await editorView.getActiveTab();
                if ((await activeTab?.getTitle()) !== title) {
                    return true;
                }
                await browser.keys([Key.Enter]);
            },
            {
                timeout: 20_000,
                interval: 2_000,
                timeoutMsg: "Can't complete cli bundle init wizard",
            }
        );

        const openProjectFolderInput = await waitForInput();
        await openProjectFolderInput.selectQuickPick(projectName);

        // Wait until vscode is re-opened with the new workspace root
        await browser.waitUntil(
            async () => {
                vscodeWorkspaceRoot = (await browser.executeWorkbench(
                    (vscode) => {
                        return vscode.workspace.workspaceFolders[0].uri.fsPath;
                    }
                )) as string;
                return vscodeWorkspaceRoot.includes(projectName);
            },
            {
                timeout: 60_000,
                timeoutMsg: "Can't connect to the new project window",
            }
        );
    });

    it("should wait for connection", async () => {
        await waitForLogin("DEFAULT");
    });

    it("should find resource explorer view", async function () {
        const section = await getViewSection("BUNDLE RESOURCE EXPLORER");
        assert(section);
        await waitForTreeItems(section, 20_000);
    });
});
