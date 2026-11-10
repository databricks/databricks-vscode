import { InputBox, type EditorTab } from "wdio-vscode-service";
import { waitUntilSeen } from "./wait.ts";

/**
 * A tab's whole label. VS Code 1.140 renders a file's extension in its own
 * `label-suffix` span, and wdio-vscode-service's `getTitle` reads only the
 * name, so "a.py" reads as "a". The tab's
 * `data-resource-name` has the file name with its extension.
 */
async function fullTitle(tab: EditorTab): Promise<string> {
    const title = await tab.getTitle();
    const resource = await tab.elem.getAttribute("data-resource-name");
    return resource !== null && resource.startsWith(title) ? resource : title;
}

/** The open editor tab whose title contains `title`. Ported from the old `commonUtils.ts`. */
export async function getTabByTitle(title: string) {
    const workbench = await browser.getWorkbench();
    let seen: string[] = [];
    return await waitUntilSeen(
        async () => {
            seen = [];
            const tabs = await workbench.getEditorView().getOpenTabs();
            for (const tab of tabs) {
                const tabTitle = await fullTitle(tab);
                seen.push(tabTitle);
                if (tabTitle.includes(title)) {
                    return tab;
                }
            }
        },
        { timeout: 5000, timeoutMsg: `No open tab's title contains "${title}"` },
        () => `the tabs were: ${seen.join(", ") || "none"}`,
    );
}

/**
 * Closes every editor, then opens `fileName` through Quick Open, as the old
 * `commonUtils.openFile` did. Quick Open is opened with its command: the
 * keyboard shortcut `openCommandPrompt` sends doesn't reach the workbench
 * in this harness. The tab is matched by its full title,
 * extension included.
 */
export async function openFile(fileName: string) {
    const workbench = await browser.getWorkbench();
    await workbench.getEditorView().closeAllEditors();
    await browser.executeWorkbench(async (vscode) => {
        await vscode.commands.executeCommand("workbench.action.quickOpen");
    });
    const input = await new InputBox(workbench.locatorMap).wait();
    await input.setText(fileName);
    await browser.waitUntil(async () => (await input.getQuickPicks()).length > 0, {
        timeout: 10_000,
        timeoutMsg: `Quick Open found no ${fileName}`,
    });
    await input.confirm();
    await browser.waitUntil(async () => {
        const activeTab = await workbench.getEditorView().getActiveTab();
        return activeTab !== undefined && (await fullTitle(activeTab)).includes(fileName);
    });
}
