import assert from "node:assert";
import {
    CustomTreeSection,
    sleep,
    TreeItem,
    ViewControl,
    ViewSection,
    InputBox,
} from "wdio-vscode-service";

// eslint-disable-next-line @typescript-eslint/naming-convention
const ViewSectionTypes = [
    "CLUSTERS",
    "CONFIGURATION",
    "WORKSPACE EXPLORER",
] as const;
export type ViewSectionType = (typeof ViewSectionTypes)[number];

export async function findViewSection(name: ViewSectionType) {
    const workbench = await browser.getWorkbench();

    let control: ViewControl | undefined;
    await browser.waitUntil(
        async () => {
            control = await workbench
                .getActivityBar()
                .getViewControl("Databricks");
            if (!control) {
                return false;
            }
            return true;
        },
        {
            timeout: 10 * 1000,
            interval: 1 * 1000,
            timeoutMsg: `Can't find view control "${name}"`,
        }
    );
    const views =
        (await (await control?.openView())?.getContent()?.getSections()) ?? [];
    for (const v of views) {
        if ((await v.getTitle()).toUpperCase() === name) {
            return v;
        }
    }
}

export async function getViewSection(
    name: ViewSectionType
): Promise<ViewSection | undefined> {
    const section = await findViewSection(name);
    assert(section);

    for (const s of ViewSectionTypes) {
        if (s !== name) {
            await (await findViewSection(s))?.collapse();
        }
    }

    await section.expand();
    await (await section.elem).click();
    return section;
}

export async function getViewSubSection(
    section: ViewSectionType,
    subSection: string
): Promise<TreeItem | undefined> {
    for (const s of ViewSectionTypes) {
        if (s !== section) {
            await (await findViewSection(s))?.collapse();
        }
    }
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

export async function dismissNotifications() {
    const workbench = await browser.getWorkbench();
    await sleep(1000);
    const notifs = await workbench.getNotifications();
    try {
        for (const n of notifs) {
            await n.dismiss();
        }
    } catch {}
}

export async function waitForSyncComplete() {
    await browser.waitUntil(
        async () => {
            return await getViewSubSection("CONFIGURATION", "Sync Destination");
        },
        {
            timeout: 20000,
            interval: 2000,
            timeoutMsg: "Couldn't find sync destination tree items.",
        }
    );
    await browser.waitUntil(
        async () => {
            const repoConfigItem = await getViewSubSection(
                "CONFIGURATION",
                "Sync Destination"
            );
            if (repoConfigItem === undefined) {
                return false;
            }
            await repoConfigItem.expand();

            let status: TreeItem | undefined = undefined;
            for (const i of await repoConfigItem.getChildren()) {
                if ((await i.getLabel()).includes("State")) {
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
            interval: 2000,
            timeoutMsg: "Couldn't finish sync in 1m",
        }
    );
}

export async function startSyncIfStopped() {
    browser.waitUntil(
        async () => {
            const repoConfigItem = await getViewSubSection(
                "CONFIGURATION",
                "Sync Destination"
            );
            if (repoConfigItem === undefined) {
                return false;
            }
            await repoConfigItem.expand();

            let status: TreeItem | undefined = undefined;
            for (const i of await repoConfigItem.getChildren()) {
                if ((await i.getLabel()).includes("State")) {
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

export async function getTabByTitle(title: string) {
    const workbench = await browser.getWorkbench();
    return await browser.waitUntil(
        async () => {
            console.log("Searching for a tab with title:", title);
            const tabs = await workbench.getEditorView().getOpenTabs();
            for (const tab of tabs) {
                const tabTitle = await tab.getTitle();
                console.log("Found a tab:", tabTitle);
                if (tabTitle.includes(title)) {
                    return tab;
                }
            }
        },
        {timeout: 5000}
    );
}

export async function waitForInput() {
    const workbench = await browser.getWorkbench();
    let input: InputBox | undefined;
    await browser.waitUntil(
        async () => {
            if (!input) {
                input = await new InputBox(workbench.locatorMap).wait();
            }
            if (input) {
                return !(await input.hasProgress());
            }
            return false;
        },
        {timeout: 10000}
    );
    return input!;
}

export async function waitForLogin(profileName?: string) {
    const section = (await getViewSection(
        "CONFIGURATION"
    )) as CustomTreeSection;
    assert(section, "CONFIGURATION section doesn't exist");
    await browser.waitUntil(
        async () => {
            const items = await section.getVisibleItems();
            for (const item of items) {
                const label = await item.getLabel();
                if (label.toLowerCase().includes("auth type")) {
                    if (profileName) {
                        const desc = await item.getDescription();
                        return desc?.includes(profileName);
                    } else {
                        return true;
                    }
                }
            }
        },
        {timeout: 20_000}
    );
}
