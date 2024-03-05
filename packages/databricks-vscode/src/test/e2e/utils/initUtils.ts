import assert from "node:assert";
import {waitForInput, getTabByTitle} from "./commonUtils.ts";
import {sleep, Workbench} from "wdio-vscode-service";
import {Key} from "webdriverio";
import {tmpdir} from "node:os";
import {randomUUID} from "node:crypto";

export async function initProject(workbench: Workbench) {
    await browser.executeWorkbench((vscode) => {
        vscode.commands.executeCommand("databricks.bundle.initNewProject");
    });

    const projectName = `vscode_integration_test_${randomUUID().slice(0, 8)}`;

    const hostSelectionInput = await waitForInput();
    await hostSelectionInput.confirm();

    await sleep(1000);

    const profileSelectionInput = await waitForInput();
    await profileSelectionInput.selectQuickPick("DEFAULT");

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

    // Wait for the databricks cli terminal window to pop up and select all
    // default options for the default template
    const editorView = workbench.getEditorView();
    const title = "Databricks Project Init";
    const initTab = await getTabByTitle(title);
    assert(initTab, "Can't find a tab for project-init terminal wizard");
    await initTab.select();

    //select temaplate type
    await browser.keys([..."default-python".split(""), Key.Enter]);
    //enter project name temaplate type
    await browser.keys([...projectName.split(""), Key.Enter]);
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

    let workspaceRoot: string = "";
    // Wait until vscode is re-opened with the new workspace root
    await browser.waitUntil(
        async () => {
            workspaceRoot = (await browser.executeWorkbench((vscode) => {
                return vscode.workspace.workspaceFolders[0].uri.fsPath;
            })) as string;
            return workspaceRoot.includes(projectName);
        },
        {timeout: 20_000}
    );

    return {workspaceRoot, projectName};
}
