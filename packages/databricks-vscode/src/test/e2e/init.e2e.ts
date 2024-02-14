import assert from "node:assert";
import {
    dismissNotifications,
    waitForInput,
    getTabByTitle,
    getViewSection,
} from "./utils.ts";
import {sleep, Workbench} from "wdio-vscode-service";
import {Key} from "webdriverio";

describe("Configure Databricks Extension", async function () {
    // this will be populated by the tests
    let workbench: Workbench;
    // let projectDir: string;

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
        // projectDir = process.env.WORKSPACE_PATH;
        workbench = await browser.getWorkbench();
        await dismissNotifications();
    });

    it("should open VSCode", async function () {
        const title = await workbench.getTitleBar().getTitle();
        assert(title.indexOf("[Extension Development Host]") >= 0);
    });

    it("should dismiss notifications", async function () {
        // Collect all notifications
        sleep(2000);
        const notifications = await workbench.getNotifications();
        for (const n of notifications) {
            await n.dismiss();
        }
    });

    it("should wait for a welcome screen", async () => {
        const section = await getViewSection("CONFIGURATION");
        const welcomeButtons = await browser.waitUntil(async () => {
            const welcome = await section!.findWelcomeContent();
            const buttons = await welcome!.getButtons();
            if (buttons?.length >= 2) {
                return buttons;
            }
        });
        assert(welcomeButtons);
        const initTitle = await welcomeButtons[0].getTitle();
        const quickStartTitle = await welcomeButtons[1].getTitle();
        assert(initTitle.toLowerCase().includes("initialize"));
        assert(quickStartTitle.toLowerCase().includes("quickstart"));
    });

    it("should open databricks panel and login", async function () {
        await browser.executeWorkbench((vscode) => {
            vscode.commands.executeCommand("databricks.bundle.initNewProject");
        });

        // Host selection input
        let input = await waitForInput();
        await input.confirm();

        await sleep(1000);

        // Profile selection input
        input = await waitForInput();
        await input.selectQuickPick("DEFAULT");
    });

    it("should initialize new project", async function () {
        // Project parent folder input
        const input = await waitForInput();

        // Clicking on the first pick manually, as selectQuickPick partially deletes default input value
        const picks = await input.getQuickPicks();
        const pick = picks.filter((p) => p.getIndex() === 0)[0];
        assert(pick !== undefined);
        await pick.select();

        const editorView = workbench.getEditorView();
        const title = "Databricks Project Init";
        const initTab = await getTabByTitle(title);
        assert(initTab !== undefined);
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

        // Project folder input
        const projectInput = await waitForInput();
        await projectInput.selectQuickPick("/my_project");

        // TODO: wdio-vscode-service needs to be improved for this to work properly
        // Wait until vscode is re-opened with the new workspace root
        // await browser.waitUntil(
        //     async () => {
        //         const workspaceRoot = await browser.executeWorkbench((vscode) => {
        //             return vscode.workspace.workspaceFolders[0].uri.fsPath;
        //         });
        //         return workspaceRoot === path.join(projectDir, "/my_project");
        //     },
        //     { timeout: 3000, interval: 500 }
        // );
    });
});
