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
 * Polls visible items in the given section until one with exactly `label` is
 * found, scrolling through the list if the item is not in the initial viewport.
 *
 * VS Code tree views use virtual scrolling (~25 DOM rows at a time). When many
 * user-owned catalogs push `system` below the fold, we press End to jump to the
 * bottom and then page up until the item appears.
 */
export async function findUCItem(
    section: CustomTreeSection,
    label: string,
    timeoutMs = 30_000
): Promise<TreeItem> {
    // Fast path: item is already visible
    const initial = await section.getVisibleItems();
    for (const item of initial) {
        if ((await item.getLabel()) === label) {
            return item;
        }
    }

    // Slow path: scroll through the list.
    // Focus the tree so keyboard navigation works, then jump to End.
    if (initial.length > 0) {
        await initial[0].elem.click();
        await browser.pause(200);
    }
    await browser.keys(["End"]);
    await browser.pause(400);

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
            // Not found on this page — scroll up and retry
            await browser.keys(["PageUp"]);
            await browser.pause(300);
            return false;
        },
        {
            timeout: timeoutMs,
            interval: 800,
            timeoutMsg: `No visible UNITY CATALOG item with label "${label}"`,
        }
    );
    return found!;
}

/**
 * Expands items along `path` one level at a time and returns the children of
 * the final item.  This replaces `section.openItem(...)` which internally calls
 * `findItem()` — a method that always resets scroll to Home and only inspects
 * the ~25 currently rendered DOM rows, missing items below the fold.
 *
 * Example: `openUCPath(section, "system", "access")` expands `system`, then
 * finds `access` among its children, expands it, and returns its children.
 */
export async function openUCPath(
    section: CustomTreeSection,
    ...path: [string, ...string[]]
): Promise<TreeItem[]> {
    let current: TreeItem = await findUCItem(section, path[0]);

    for (let i = 0; i < path.length; i++) {
        // Bring item into view before interacting with it
        await current.elem.scrollIntoView();
        await browser.pause(200);

        let children: TreeItem[] = [];
        await browser.waitUntil(
            async () => {
                // getChildren() calls expand() internally then queries DOM rows
                children = await (current as any).getChildren();
                return children.length > 0;
            },
            {
                timeout: 30_000,
                interval: 1000,
                timeoutMsg: `No children found under "${path.slice(0, i + 1).join(".")}"`,
            }
        );

        if (i === path.length - 1) {
            return children;
        }

        // Descend into the next path segment
        const nextLabel = path[i + 1];
        let next: TreeItem | undefined;
        for (const child of children) {
            if ((await child.getLabel()) === nextLabel) {
                next = child;
                break;
            }
        }
        if (!next) {
            throw new Error(
                `Item "${nextLabel}" not found under "${path.slice(0, i + 1).join(".")}"`
            );
        }
        current = next;
    }

    return [];
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
