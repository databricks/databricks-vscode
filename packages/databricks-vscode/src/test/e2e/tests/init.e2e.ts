import assert from "node:assert";
import {
    dismissNotifications,
    waitForInput,
    getTabByTitle,
    getViewSection,
    waitForTreeItems,
} from "../utils.ts";
import {sleep, Workbench} from "wdio-vscode-service";
import {Key} from "webdriverio";
import {tmpdir} from "node:os";

describe("Configure Databricks Extension", async function () {
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
        workbench = await browser.getWorkbench();
        await dismissNotifications();
    });

    it("should wait for initializaion", async () => {
        const section = await getViewSection("CONFIGURATION");
        assert(section);
        await waitForTreeItems(section);
    });

    it("should manually login for a new project initialization", async function () {
        await browser.executeWorkbench((vscode) => {
            vscode.commands.executeCommand("databricks.bundle.initNewProject");
        });

        const hostSelectionInput = await waitForInput();
        await hostSelectionInput.confirm();

        await sleep(1000);

        const profileSelectionInput = await waitForInput();
        await profileSelectionInput.selectQuickPick("DEFAULT");
    });

    it("should initialize new project", async function () {
        const parentDir = tmpdir();
        const parentFolderInput = await waitForInput();
        // Type in the parentDir value to the input
        await browser.keys(parentDir);
        await sleep(1000);
        const picks = await parentFolderInput.getQuickPicks();
        const pick = picks.filter((p) => p.getIndex() === 0)[0];
        assert(pick, "Parent folder quick pick doesn't have any items");
        expect(await pick.getLabel()).toBe(parentDir);
        await pick.select();

        const editorView = workbench.getEditorView();
        const title = "Databricks Project Init";
        const initTab = await getTabByTitle(title);
        assert(initTab, "Can't find a tab for project-init terminal wizard");
        await initTab.select();
        await browser.waitUntil(
            async () => {
                const activeTab = await editorView.getActiveTab();
                if ((await activeTab?.getTitle()) !== title) {
                    return true;
                }
                await browser.keys([Key.Enter]);
            },
            {timeout: 20_000, interval: 2_000}
        );

        const openProjectFolderInput = await waitForInput();
        await openProjectFolderInput.selectQuickPick("my_project");

        // Wait until vscode is re-opened with the new workspace root
        await browser.waitUntil(
            async () => {
                const workspaceRoot = await browser.executeWorkbench(
                    (vscode) => {
                        return vscode.workspace.workspaceFolders[0].uri.fsPath;
                    }
                );
                return workspaceRoot.includes("my_project");
            },
            {timeout: 20_000}
        );
    });
});
