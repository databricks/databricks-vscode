import assert from "node:assert";
import { CustomTreeSection, TreeItem } from "wdio-vscode-service";
import { getViewSection } from "./view.ts";

/*
 * Ported from the old suite's `unityCatalogUtils.ts`, unchanged but for
 * the imports.
 */

/**
 * Gets the UNITY CATALOG section, expanded and with at least one item loaded.
 */
export async function getUCSection(timeoutMs = 30_000): Promise<CustomTreeSection> {
    let section: CustomTreeSection | undefined;
    await browser.waitUntil(
        async () => {
            section = (await getViewSection("UNITY CATALOG")) as CustomTreeSection;
            if (!section) {
                return false;
            }
            const items = await section.getVisibleItems();
            return items.length > 0;
        },
        {
            timeout: timeoutMs,
            interval: 2000,
            timeoutMsg: "UNITY CATALOG section did not show items within timeout",
        },
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
 *
 * Changed from the old helper: it presses End before its
 * first look, not after. After a pin, the first `system` row is the copy
 * under Favorites, at the top.
 */
export async function findUCItem(
    section: CustomTreeSection,
    label: string,
    timeoutMs = 90_000,
): Promise<TreeItem> {
    let found: TreeItem | undefined;
    let scrolledToBottom = false;

    await browser.waitUntil(
        async () => {
            const items = await section.getVisibleItems();
            for (const item of scrolledToBottom ? items : []) {
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
                const list = await section.elem.$(".monaco-list").getElement();
                if (await list.isExisting()) {
                    await browser.execute((el: HTMLElement) => el.focus(), list);
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
        },
    );
    return found!;
}

/**
 * Expands an already-located tree item and returns its children once the list
 * has fully loaded and stabilised.
 *
 * UC nodes lazy-load their children over the network and stream them into the
 * tree incrementally.  A naive `waitUntil(() => getChildren().length > 0)`
 * returns on the *first* child that arrives, which is why the "system" catalog
 * intermittently reported only `__internal_data_quality_monitoring` (it sorts
 * before `access`, so it streams in first) and the `access` assertion flaked.
 *
 * To avoid that race we require the child count to be non-zero AND unchanged for
 * several consecutive polls before accepting the result, so the whole batch has
 * landed.  The parent is scrolled to the top of the viewport first (`revealUCRow`):
 * VS Code virtual lists only render the ~25 rows inside the scroll window, so
 * keeping the parent at the top keeps its immediate children rendered.
 */
async function getStableChildren(
    section: CustomTreeSection,
    item: TreeItem,
    label: string,
    pathLabel: string,
): Promise<TreeItem[]> {
    const level = await item.elem.getAttribute("aria-level");
    let current = item;
    // The row, found again before each use (see `sameRow`), and brought into view with the
    // view's Filter only if it has left the rendered rows: the Filter's fuzzy match can land on
    // another row whose name has the same letters.
    const row = async () => {
        try {
            current = await sameRow(section, current, label, level);
        } catch {
            await revealUCRow(label);
            current = await sameRow(section, current, label, level);
        }
        return current;
    };

    // Trigger expansion once before the retry loop.  If aria-expanded
    // lags behind the click during lazy loading, the expand() call
    // inside getChildren() would otherwise toggle the item closed on
    // every retry.
    await ((await row()) as any).expand();
    await browser.pause(500);

    // Number of consecutive polls the child count must stay unchanged before we
    // treat the lazy-loaded list as fully settled.
    const requiredStableReads = 3;
    let children: TreeItem[] = [];
    let lastCount = -1;
    let stableReads = 0;

    await browser.waitUntil(
        async () => {
            // Keep the row at the top, so the children loading below it stay rendered.
            await scrollRowToTop(section, label);
            // getChildren() calls expand() internally then queries DOM rows
            children = await ((await row()) as any).getChildren();

            if (children.length > 0 && children.length === lastCount) {
                stableReads += 1;
            } else {
                stableReads = 0;
            }
            lastCount = children.length;

            return stableReads >= requiredStableReads;
        },
        {
            timeout: 30_000,
            interval: 1000,
            timeoutMsg: `Children of "${pathLabel}" did not load and stabilise`,
        },
    );

    return children;
}

/**
 * Scrolls the UNITY CATALOG view to its first row labelled `label`, with the view's Filter (VS
 * Code's tree find, which reveals the first match). It moves VS Code's list as the list expects;
 * scrolling the DOM (`scrollIntoView`) doesn't, and on a workspace with hundreds of catalogs above
 * `system` the rows found then showed other catalogs, or none.
 */
async function revealUCRow(label: string): Promise<void> {
    await browser.executeWorkbench(async (vscode) => {
        await vscode.commands.executeCommand("databricks.unityCatalog.filter");
    });
    await browser.pause(300);
    await browser.keys([process.platform === "darwin" ? "Meta" : "Control", "a"]);
    await browser.keys(["Backspace", ...label.split("")]);
    await browser.pause(500);
    // Closing the find widget keeps the rows where it scrolled them, and the view focused.
    await browser.keys(["Escape"]);
    await browser.pause(300);
}

/**
 * Scrolls the view a line at a time until the rendered row labelled `label` is the first, so its
 * children below it are rendered too; it stops when the list doesn't scroll further.
 */
async function scrollRowToTop(section: CustomTreeSection, label: string): Promise<void> {
    let lastFirst: string | undefined;
    let stuck = 0;
    for (let i = 0; i < 60 && stuck < 3; i++) {
        const labels = await renderedLabels(section);
        if (labels.indexOf(label) <= 0) {
            return;
        }
        // The list renders a scroll a moment later, so it's stuck only when several look the same.
        stuck = labels[0] === lastFirst ? stuck + 1 : 0;
        lastFirst = labels[0];
        await browser.executeWorkbench(async (vscode) => {
            await vscode.commands.executeCommand("list.scrollDown");
        });
        await browser.pause(250);
    }
}

/** The rendered rows' labels, top to bottom, in one round trip rather than one per row. */
async function renderedLabels(section: CustomTreeSection): Promise<string[]> {
    const list = await section.elem.$(".monaco-list").getElement();
    return browser.execute(
        (el: HTMLElement) =>
            Array.from(el.querySelectorAll<HTMLElement>(".monaco-list-row"))
                .sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index))
                .map((r) => r.querySelector(".label-name")?.textContent ?? ""),
        list as unknown as HTMLElement,
    );
}

/**
 * `item` if its element still shows `label`, else the rendered row at the same level that does.
 * The tree's list reuses a row's element for another row as it scrolls and as rows load, so an
 * element found earlier can show another catalog by now, and expanding it opens that one.
 */
async function sameRow(
    section: CustomTreeSection,
    item: TreeItem,
    label: string,
    level: string | null,
): Promise<TreeItem> {
    if ((await item.getLabel().catch(() => undefined)) === label) {
        return item;
    }
    for (const row of await section.getVisibleItems()) {
        if (
            (await row.getLabel()) === label &&
            (await row.elem.getAttribute("aria-level")) === level
        ) {
            return row as TreeItem;
        }
    }
    throw new Error(`The row "${label}" is no longer rendered`);
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
        const pathLabel = path.slice(0, i + 1).join(".");
        const children = await getStableChildren(section, current, path[i]!, pathLabel);

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
                `Item "${nextLabel}" not found under "${path.slice(0, i + 1).join(".")}"`,
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
export async function getTopVisibleLabels(section: CustomTreeSection): Promise<string[]> {
    // Scroll to the top via keyboard Home so the "Favorites" group (or any
    // group added at the top of the tree) is in the viewport.
    // We use JS focus + browser.keys() instead of JS scrollTop to avoid
    // desynchronising Monaco's internal scroll model.
    const list = await section.elem.$(".monaco-list").getElement();
    if (await list.isExisting()) {
        await browser.execute((el: HTMLElement) => el.focus(), list);
        await browser.pause(100);
        await browser.keys(["Home"]);
        await browser.pause(200);
    }
    const items = await section.getVisibleItems();
    return Promise.all(items.map((i) => i.getLabel()));
}
