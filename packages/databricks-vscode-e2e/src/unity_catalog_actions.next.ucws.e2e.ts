import assert from "node:assert";
import type { TreeItem } from "wdio-vscode-service";
import { getBasicBundleConfig, writeRootBundleConfig } from "./utils/bundle-fixtures.ts";
import { waitForLogin } from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { openContextMenu } from "./utils/context-menu.ts";
import { findUCItem, getUCSection, openUCPath } from "./utils/unity-catalog.ts";

/**
 * The UNITY CATALOG view's node actions (UC-04), which no frozen
 * spec covers: "Copy" puts a node's full name on the clipboard, and
 * "Refresh" reloads a node's children. On the `system` catalog, which every
 * UC workspace has. Copying a storage location or a view's SQL needs objects
 * a workspace may not have; those stay unit-tested.
 */

async function clipboard(): Promise<string> {
    return browser.executeWorkbench((vscode) => vscode.env.clipboard.readText());
}

async function runFromContextMenu(item: TreeItem, action: string) {
    const menu = await openContextMenu(item);
    await menu.select(action);
}

async function child(parent: [string, ...string[]], label: string): Promise<TreeItem> {
    const section = await getUCSection();
    let found: TreeItem | undefined;
    await browser.waitUntil(
        async () => {
            for (const c of await openUCPath(section, ...parent)) {
                if ((await c.getLabel()) === label) {
                    found = c;
                    return true;
                }
            }
            return false;
        },
        {
            timeout: 60_000,
            interval: 2_000,
            timeoutMsg: `"${label}" isn't under ${parent.join(".")}`,
        },
    );
    return found!;
}

describe("Unity Catalog node actions", async function () {
    this.timeout(3 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        await writeRootBundleConfig(getBasicBundleConfig(), process.env.WORKSPACE_PATH);
        await waitForLogin("DEFAULT");
        await dismissNotifications();
    });

    it("should copy a catalog's name", async () => {
        await runFromContextMenu(await findUCItem(await getUCSection(), "system"), "Copy");
        await browser.waitUntil(async () => (await clipboard()) === "system", {
            timeout: 10_000,
            timeoutMsg: "The clipboard doesn't hold 'system'",
        });
    });

    it("should copy a schema's full name", async () => {
        await runFromContextMenu(await child(["system"], "access"), "Copy");
        await browser.waitUntil(async () => (await clipboard()) === "system.access", {
            timeout: 10_000,
            timeoutMsg: "The clipboard doesn't hold 'system.access'",
        });
    });

    it("should refresh a catalog's children", async () => {
        await runFromContextMenu(await findUCItem(await getUCSection(), "system"), "Refresh");
        // The schemas load again.
        await child(["system"], "access");
    });
});
