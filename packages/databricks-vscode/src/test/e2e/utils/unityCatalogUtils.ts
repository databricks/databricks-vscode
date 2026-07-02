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
    timeoutMs = 90_000
): Promise<TreeItem> {
    let found: TreeItem | undefined;
    let scrolledToBottom = false;

    await browser.waitUntil(
        async () => {
            const items = await section.getVisibleItems();
            for (const item of items) {
                if ((await item.getLabel()) === label) {
                    found = item;
                    return true;
                }
            }

            if (!scrolledToBottom && items.length > 0) {
                scrolledToBottom = true;
                // Focus the list via JS so browser.keys() is directed at the
                // tree. Avoids clicking a list item (which can expand a catalog
                // and disrupt the layout), and avoids JS scrollTop which
                // desynchronises Monaco's internal scroll model.
                const list = await section.elem.$(".monaco-list");
                if (await list.isExisting()) {
                    await browser.execute(
                        (el: HTMLElement) => el.focus(),
                        list
                    );
                    await browser.pause(100);
                }
                await browser.keys(["End"]);
                await browser.pause(500);
            } else if (scrolledToBottom) {
                await browser.keys(["PageUp"]);
                await browser.pause(400);
            }

            return false;
        },
        {
            timeout: timeoutMs,
            interval: 600,
            timeoutMsg: `No visible UNITY CATALOG item with label "${label}"`,
        }
    );
    return found!;
}

/**
 * Finds an action button on a hovered tree item by label.
 * Works around wdio-vscode-service reading null 'title' attributes in VSCode 1.120+.
 * The item must already be hovered (call item.elem.moveTo() before this).
 */
export async function getUCActionButton(
    item: TreeItem,
    label: string
): Promise<WebdriverIO.Element | undefined> {
    // Search anywhere inside the item element; don't require .actions-container
    // parent or role="button" — both can be absent in VS Code 1.120+.
    const buttons = await item.elem.$$("a.action-label");
    for (const btn of buttons) {
        const ariaLabel = await btn.getAttribute("aria-label");
        const title = await btn.getAttribute("title");
        const btnLabel = ariaLabel || title;
        if (btnLabel && btnLabel.includes(label)) {
            return btn;
        }
    }
    return undefined;
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
        await current.elem.scrollIntoView({block: "start"});
        await browser.pause(200);

        // Trigger expansion once before the retry loop.  If aria-expanded
        // lags behind the click during lazy loading, the expand() call
        // inside getChildren() would otherwise toggle the item closed on
        // every retry.
        await (current as any).expand();
        await browser.pause(500);

        let children: TreeItem[] = [];
        await browser.waitUntil(
            async () => {
                // Re-scroll the item to the top of the viewport on every
                // retry.  VS Code virtual lists only render rows that are
                // inside the current scroll window; after expansion the list
                // may have scrolled so that the item's children are below the
                // rendered region and therefore absent from the DOM.  Keeping
                // the parent item at the top ensures its immediate children
                // are rendered.
                await current.elem.scrollIntoView({block: "start"});
                await browser.pause(100);
                // getChildren() calls expand() internally then queries DOM rows
                children = await (current as any).getChildren();
                return children.length > 0;
            },
            {
                timeout: 30_000,
                interval: 1000,
                timeoutMsg: `No children found under "${path
                    .slice(0, i + 1)
                    .join(".")}"`,
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
                `Item "${nextLabel}" not found under "${path
                    .slice(0, i + 1)
                    .join(".")}"`
            );
        }
        current = next;
    }

    return [];
}

/**
 * Scrolls the section's list to the top, then returns the visible item labels.
 * Use this when the tree may be scrolled past the items you want to check
 * (e.g., verifying a "Favorites" group that appears at the top of the list).
 */
export async function getTopVisibleLabels(
    section: CustomTreeSection
): Promise<string[]> {
    // Scroll to the top via keyboard Home so the "Favorites" group (or any
    // group added at the top of the tree) is in the viewport.
    // We use JS focus + browser.keys() instead of JS scrollTop to avoid
    // desynchronising Monaco's internal scroll model.
    const list = await section.elem.$(".monaco-list");
    if (await list.isExisting()) {
        await browser.execute((el: HTMLElement) => el.focus(), list);
        await browser.pause(100);
        await browser.keys(["Home"]);
        await browser.pause(200);
    }
    const items = await section.getVisibleItems();
    return Promise.all(items.map((i) => i.getLabel()));
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
