import assert from "node:assert";
import {
    CustomTreeSection,
    sleep,
    TreeItem,
    ViewSection,
} from "wdio-vscode-service";

export type ViewSectionType = "CLUSTERS" | "CONFIGURATION";
export async function getViewSection(
    name: ViewSectionType
): Promise<ViewSection | undefined> {
    const workbench = await browser.getWorkbench();

    let control;
    for (let i = 0; i <= 10; i++) {
        if (i === 10) {
            assert.fail(`Can't find view control "${name}"`);
        }
        control = await workbench.getActivityBar().getViewControl("Databricks");
        if (control) {
            break;
        }
        await sleep(500);
    }
    assert.ok(control);

    const view = await control.openView();
    assert.ok(view);

    const content = await view.getContent();
    assert.ok(content);

    const section = await content.getSection(name);
    assert.ok(section);

    await section.expand();
    await (await section.elem).click();
    return section;
}

export async function getViewSubSection(
    section: ViewSectionType,
    subSection: string
): Promise<TreeItem | undefined> {
    const sectionView = await getViewSection(section);

    if (!sectionView) {
        return;
    }

    const configTree = sectionView as CustomTreeSection;

    await waitForTreeItems(configTree);
    const configItems = await configTree.getVisibleItems();

    let subConfigItem: TreeItem | undefined;
    for (const i of configItems) {
        const label = await i.getLabel();
        if (label.startsWith(subSection)) {
            subConfigItem = i;
            break;
        }
    }
    return subConfigItem;
}

export async function waitForTreeItems(
    section: ViewSection,
    timeoutMs = 5000
): Promise<boolean> {
    const start = Date.now();
    while (true) {
        const items = await section.getVisibleItems();
        if (items.length > 0) {
            return true;
        }
        if (Date.now() - start > timeoutMs) {
            return false;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
}

export async function waitForPythonExtension() {
    const section = await getViewSection("CONFIGURATION");
    assert(section);
    const welcome = await section.findWelcomeContent();
    assert(welcome);
    sleep(1000);
    const workbench = await browser.getWorkbench();
    const notifs = await workbench.getNotifications();
    for (const n of notifs) {
        if (
            (await n.getActions()).find(
                (btn) => btn.getTitle() === "Install and Reload"
            ) !== undefined
        ) {
            await n.takeAction("Install and Reload");
        }
    }

    await browser.waitUntil(
        async () =>
            (
                await (
                    await workbench.getEditorView().getActiveTab()
                )?.getTitle()
            )?.includes("README.quickstart.md") === true,
        {
            timeout: 120000,
            timeoutMsg:
                "Timeout when installing python extension and reloading",
        }
    );

    sleep(500);
    try {
        for (const n of notifs) {
            await n.dismiss();
        }
    } catch {}
}
