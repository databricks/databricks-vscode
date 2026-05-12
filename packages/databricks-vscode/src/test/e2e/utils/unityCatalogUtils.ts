import assert from "assert";
import {CustomTreeSection, TreeItem} from "wdio-vscode-service";
import {getViewSection} from "./commonUtils.ts";

/**
 * Gets the UNITY CATALOG section, expanded and with at least one item loaded.
 */
export async function getUCSection(
    timeoutMs = 30_000
): Promise<CustomTreeSection> {
    let section: CustomTreeSection | undefined;
    await browser.waitUntil(
        async () => {
            section = (await getViewSection(
                "UNITY CATALOG"
            )) as CustomTreeSection;
            if (!section) {
                return false;
            }
            const items = await section.getVisibleItems();
            return items.length > 0;
        },
        {
            timeout: timeoutMs,
            interval: 2000,
            timeoutMsg:
                "UNITY CATALOG section did not show items within timeout",
        }
    );
    assert(section, "UNITY CATALOG section not found");
    return section;
}

/**
 * Polls visible items in the given section until one with exactly `label` is found.
 */
export async function findUCItem(
    section: CustomTreeSection,
    label: string,
    timeoutMs = 15_000
): Promise<TreeItem> {
    let found: TreeItem | undefined;
    await browser.waitUntil(
        async () => {
            const items = await section.getVisibleItems();
            for (const item of items) {
                if ((await item.getLabel()) === label) {
                    found = item;
                    return true;
                }
            }
            return false;
        },
        {
            timeout: timeoutMs,
            interval: 500,
            timeoutMsg: `No visible UNITY CATALOG item with label "${label}"`,
        }
    );
    return found!;
}

/**
 * Returns the labels of all currently visible items in the section.
 */
export async function getVisibleLabels(
    section: CustomTreeSection
): Promise<string[]> {
    const items = await section.getVisibleItems();
    return Promise.all(items.map((i) => i.getLabel()));
}
