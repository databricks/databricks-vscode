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

export async function waitForPythonExtension(timeoutMs: number) {
    const section = await getViewSection("CONFIGURATION");
    assert(section);
    const workbench = await browser.getWorkbench();

    await browser.waitUntil(
        async () => {
            const notifs = await workbench.getNotifications();
            let found = false;
            for (const n of notifs) {
                if (
                    (await n.getActions()).find(
                        (btn) => btn.getTitle() === "Install and Reload"
                    ) !== undefined
                ) {
                    await n.takeAction("Install and Reload");
                    found = true;
                }
            }
            return found;
        },
        {
            timeout: 5 * 1000,
            interval: 500,
            timeoutMsg:
                "Can't find notification to install ms-python extension",
        }
    );

    await browser.waitUntil(
        async () =>
            (
                await (
                    await workbench.getEditorView().getActiveTab()
                )?.getTitle()
            )?.includes("README.quickstart.md") === true,
        {
            timeout: timeoutMs,
            timeoutMsg:
                "Timeout when installing python extension and reloading",
        }
    );

    await sleep(500);
    try {
        const notifs = await workbench.getNotifications();
        for (const n of notifs) {
            await n.dismiss();
        }
    } catch {}
}

export async function waitForPythonExtensionWithRetry(
    timeoutMs: number,
    retryCount: number
) {
    for (let i = 0; i < retryCount; i++) {
        try {
            const section = await getViewSection("CONFIGURATION");
            assert(section);
            await waitForPythonExtension(timeoutMs);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
            const wb = await browser.getWorkbench();
            await wb.executeCommand("Developer: Reload Window");
            if (i === retryCount - 1) {
                throw e;
            }
            continue;
        }
        break;
    }
}

export async function waitForSyncComplete() {
    await browser.waitUntil(
        async () => {
            const repoConfigItem = await getViewSubSection(
                "CONFIGURATION",
                "Repo"
            );
            if (repoConfigItem === undefined) {
                return false;
            }
            await repoConfigItem.expand();

            let status: TreeItem | undefined = undefined;
            for (const i of await repoConfigItem.getChildren()) {
                if ((await i.getLabel()).includes("State:")) {
                    status = i;
                    break;
                }
            }
            if (status === undefined) {
                return false;
            }

            const description = await status?.getDescription();
            return (
                description !== undefined &&
                description.includes("WATCHING_FOR_CHANGES")
            );
        },
        {
            timeout: 60000,
            interval: 20000,
            timeoutMsg: "Couldn't finish sync in 1m",
        }
    );
}

export async function startSyncIfStopped() {
    browser.waitUntil(
        async () => {
            const repoConfigItem = await getViewSubSection(
                "CONFIGURATION",
                "Repo"
            );
            if (repoConfigItem === undefined) {
                return false;
            }
            await repoConfigItem.expand();

            let status: TreeItem | undefined = undefined;
            for (const i of await repoConfigItem.getChildren()) {
                if ((await i.getLabel()).includes("State:")) {
                    status = i;
                    break;
                }
            }
            if (status === undefined) {
                return false;
            }

            if ((await status.getDescription())?.includes("STOPPED")) {
                const buttons = await repoConfigItem.getActionButtons();
                if (buttons.length === 0) {
                    return false;
                }
                await buttons[0].elem.click();
            }
            return true;
        },
        {
            timeout: 20000,
        }
    );
}
