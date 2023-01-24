import assert from "node:assert";
import {
    CustomTreeSection,
    sleep,
    TreeItem,
    ViewControl,
    ViewSection,
} from "wdio-vscode-service";

// eslint-disable-next-line @typescript-eslint/naming-convention
const ViewSectionTypes = ["CLUSTERS", "CONFIGURATION"] as const;
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
    const view = await (await control?.openView())
        ?.getContent()
        ?.getSection(name);
    return view;
}

export async function getViewSection(
    name: ViewSectionType
): Promise<ViewSection | undefined> {
    const section = await findViewSection(name);
    assert(section);

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
