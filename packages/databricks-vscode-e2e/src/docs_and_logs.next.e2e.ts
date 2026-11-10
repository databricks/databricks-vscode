import assert from "node:assert";
import { getBasicBundleConfig, writeRootBundleConfig } from "./utils/bundle-fixtures.ts";
import { waitForLogin } from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { getTabByTitle } from "./utils/editor.ts";
import { getViewSection } from "./utils/view.ts";

/**
 * The Quickstart walkthrough (SHELL-09) and the "Databricks Logs" channel
 * (INFRA-04), which no frozen spec covers. Every session starts with fresh
 * global state, so it is a first install.
 */

/** VS Code titles a walkthrough's tab "Welcome". */
const QUICKSTART_TAB = "Welcome";

async function waitForQuickstartTab() {
    await browser.waitUntil(
        async () => (await getTabByTitle(QUICKSTART_TAB).catch(() => undefined)) !== undefined,
        {
            timeout: 30_000,
            interval: 1_000,
            timeoutMsg: `No "${QUICKSTART_TAB}" walkthrough opened`,
        },
    );
}

async function closeAllEditors() {
    await (await browser.getWorkbench()).getEditorView().closeAllEditors();
}

describe("Quickstart and logs", async function () {
    this.timeout(3 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        await writeRootBundleConfig(getBasicBundleConfig({}, false), process.env.WORKSPACE_PATH);
    });

    it("should open nothing by itself at startup (SHELL-09)", async () => {
        assert(await getViewSection("PROJECT"));
        await waitForLogin("DEFAULT");
        await dismissNotifications();
        const tabs = await (await browser.getWorkbench()).getEditorView().getOpenTabs();
        assert.strictEqual(tabs.length, 0, "Something opened at startup");
    });

    it("should open the Quickstart from the palette", async () => {
        await browser.executeWorkbench(async (vscode) => {
            await vscode.commands.executeCommand("databricks.quickstart.open");
        });
        await waitForQuickstartTab();
        await closeAllEditors();
    });

    it("should log to the Databricks Logs channel (INFRA-04)", async () => {
        const workbench = await browser.getWorkbench();
        const output = await workbench.getBottomBar().openOutputView();
        await browser.waitUntil(
            async () => {
                try {
                    if ((await output.getCurrentChannel()) !== "Databricks Logs") {
                        await output.selectChannel("Databricks Logs");
                    }
                    // The view renders only what fits the panel's width.
                    return (await output.getText())
                        .join("\n")
                        .includes("[Extension] Activated databricks");
                } catch {
                    return false;
                }
            },
            {
                timeout: 20_000,
                interval: 1_000,
                timeoutMsg: 'The "Databricks Logs" channel has no activation line',
            },
        );
    });
});
