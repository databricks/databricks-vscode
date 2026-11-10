import { ContextMenu, type TreeItem } from "wdio-vscode-service";
import { elements } from "./view.ts";

/**
 * The context menu that is on screen, or undefined. VS Code also keeps hidden
 * menus in the workbench, and since 1.144 one of them (the chat's response
 * selection menu) comes before the real ones in the DOM. A lookup for the
 * first `.monaco-menu-container` then finds that one, which never shows, so
 * the menu lookups here take the first one that is displayed.
 */
async function shownContextMenu(): Promise<WebdriverIO.Element | undefined> {
    for (const element of await elements(".monaco-menu-container")) {
        if (await element.isDisplayed()) {
            return element;
        }
    }
    return undefined;
}

/** Closes the menu on screen, if any: an open menu covers the page and intercepts clicks. */
export async function closeShownContextMenu(): Promise<void> {
    if ((await shownContextMenu()) === undefined) {
        return;
    }
    await browser.keys(["Escape"]);
    await browser.waitUntil(async () => (await shownContextMenu()) === undefined, {
        timeout: 5_000,
        timeoutMsg: "The context menu didn't close",
    });
}

/** Waits for a context menu to show, and returns it, or undefined after `timeout` ms. */
export async function waitForShownContextMenu(
    timeout = 5_000,
): Promise<WebdriverIO.Element | undefined> {
    let menu: WebdriverIO.Element | undefined;
    await browser
        .waitUntil(
            async () => {
                menu = await shownContextMenu();
                return menu !== undefined;
            },
            { timeout, interval: 200 },
        )
        .catch(() => false);
    return menu;
}

/** Right-clicks `target` and returns its context menu, once it shows and loads its items. */
export async function openContextMenu(target: TreeItem): Promise<ContextMenu> {
    await closeShownContextMenu();
    await target.elem.click({ button: 2 });
    const menu = await waitForShownContextMenu();
    if (menu === undefined) {
        throw new Error("Right-clicking the item opened no context menu");
    }
    // The service scopes a menu to its base element; here, the one that shows.
    return new ContextMenu((await browser.getWorkbench()).locatorMap, browser.$(menu)).wait();
}
