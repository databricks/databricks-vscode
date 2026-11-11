import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { getBasicBundleConfig, writeRootBundleConfig } from "./utils/bundle-fixtures.ts";
import { waitForLogin } from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { closeShownContextMenu, waitForShownContextMenu } from "./utils/context-menu.ts";
import { openFile } from "./utils/editor.ts";

/**
 * The "Run on Databricks" editor menu (RUN-11), which the frozen
 * specs reach only through the palette. A Python file of the project gets
 * the menu with the run and debug entries; signed out, the menu offers to
 * sign in, as the old menu did.
 */

const RUN_ENTRIES = [
    "Upload and Run File",
    "Run File as Workflow",
    "Run current file with Databricks Connect",
    "Debug current file with Databricks Connect",
];
const SIGN_IN = "Sign in to Databricks workspace";

/**
 * The submenu's entries. The editor's title actions carry their names in
 * `aria-label` (VS Code no longer sets the `title` that the service's
 * `getAction` reads), and the submenu opens as a context menu.
 */
async function runMenuItems(): Promise<string[]> {
    let labels: string[] = [];
    await browser.waitUntil(
        async () => {
            // An open menu covers the editor's actions, so a click would be intercepted.
            await closeShownContextMenu();
            const action = $('.editor-actions a.action-label[aria-label^="Run on Databricks"]');
            if (!(await action.isExisting())) {
                return false;
            }
            await action.click();
            const menu = await waitForShownContextMenu();
            if (menu === undefined) {
                return false;
            }
            labels = [];
            for (const item of await menu.$$(".action-label").getElements()) {
                const text = (await item.getText()).trim();
                if (text !== "") {
                    labels.push(text);
                }
            }
            await closeShownContextMenu();
            return labels.length > 0;
        },
        {
            timeout: 30_000,
            interval: 1_000,
            timeoutMsg: 'The editor has no "Run on Databricks" menu',
        },
    );
    return labels;
}

describe("Run on Databricks menu", async function () {
    this.timeout(3 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        const root = process.env.WORKSPACE_PATH;
        await writeRootBundleConfig(getBasicBundleConfig(), root);
        await fs.mkdir(path.join(root, "src"), { recursive: true });
        await fs.writeFile(path.join(root, "src", "run_menu.py"), "print('hello')\n");
        await waitForLogin("DEFAULT");
        await dismissNotifications();
        await openFile("run_menu.py");
    });

    it("should offer the run and debug entries for a Python file", async () => {
        const labels = await runMenuItems();
        for (const entry of RUN_ENTRIES) {
            assert(labels.includes(entry), `The menu has no "${entry}": ${labels.join(", ")}`);
        }
        assert(!labels.includes(SIGN_IN), "The menu offers to sign in while signed in");
    });

    it("should offer to sign in when signed out", async () => {
        await browser.executeWorkbench(async (vscode) => {
            await vscode.commands.executeCommand("databricks.connection.logout");
        });
        await browser.waitUntil(async () => (await runMenuItems()).includes(SIGN_IN), {
            timeout: 30_000,
            interval: 2_000,
            timeoutMsg: `The menu doesn't offer "${SIGN_IN}" when signed out`,
        });
    });
});
