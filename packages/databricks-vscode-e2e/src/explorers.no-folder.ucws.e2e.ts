import assert from "node:assert";
import { CustomTreeSection } from "wdio-vscode-service";
import { getUniqueResourceName } from "./utils/bundle-fixtures.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { findUCItem, getUCSection } from "./utils/unity-catalog.ts";
import { getViewSection } from "./utils/view.ts";
import { WorkspaceClient } from "./utils/workspace-client.ts";

/**
 * The explorers without a folder: no
 * folder is open, and the window connects to the CLI's default profile.
 * WORKSPACE FILE SYSTEM lists the home folder, and
 * UNITY CATALOG lists the `system` catalog.
 *
 * Needs a `[DEFAULT]` profile in DATABRICKS_CONFIG_FILE that can sign in.
 */
describe("Explorers without a folder", async function () {
    let workspaceClient: WorkspaceClient;
    let folderPath: string;
    const folderName = getUniqueResourceName("explorers_no_folder");

    this.timeout(3 * 60 * 1000);

    before(async function () {
        workspaceClient = new WorkspaceClient({ profile: "DEFAULT" });
        const me = await workspaceClient.currentUser.me();
        folderPath = `/Users/${me.userName}/${folderName}`;
        await workspaceClient.workspace.mkdirs({ path: folderPath });
    });

    after(async function () {
        try {
            await workspaceClient.workspace.delete({ path: folderPath, recursive: true });
        } catch {
            // ignore, the folder may already be gone
        }
    });

    it("should open VS Code without a folder, connected", async () => {
        const folders = await browser.executeWorkbench(
            (vscode) => vscode.workspace.workspaceFolders?.length ?? 0,
        );
        assert.strictEqual(folders, 0);
        // Opening the Databricks view activates the extension.
        assert(await getViewSection("PROJECT"));
        await browser.waitUntil(
            async () => {
                const items = await (await browser.getWorkbench()).getStatusBar().getItems();
                return items.some((item) => item.includes("Databricks: DEFAULT"));
            },
            {
                timeout: 60_000,
                interval: 1_000,
                timeoutMsg: `The status bar never showed "Databricks: DEFAULT"`,
            },
        );
        await dismissNotifications();
    });

    it("should list the home folder in WORKSPACE FILE SYSTEM", async () => {
        const section = (await getViewSection("WORKSPACE FILE SYSTEM")) as CustomTreeSection;
        assert(section, "WORKSPACE FILE SYSTEM section doesn't exist");
        await browser.waitUntil(
            async () => {
                const labels = await Promise.all(
                    (await section.getVisibleItems()).map((i) => i.getLabel()),
                );
                return labels.includes(folderName);
            },
            {
                timeout: 30_000,
                interval: 1_000,
                timeoutMsg: `"${folderName}" isn't listed in WORKSPACE FILE SYSTEM`,
            },
        );
    });

    it("should list the 'system' catalog in UNITY CATALOG", async () => {
        const section = await getUCSection();
        await findUCItem(section, "system");
    });
});
