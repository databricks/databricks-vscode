import assert from "node:assert";
import {
    dismissNotifications,
    getTabByTitle,
    getUniqueResourceName,
    getViewSection,
    waitForInput,
    waitForLogin,
} from "./utils/commonUtils.ts";
import {
    getBasicBundleConfig,
    writeRootBundleConfig,
} from "./utils/dabsFixtures.ts";
import {WorkspaceClient} from "@databricks/sdk-experimental";
import {CustomTreeSection, TreeItem} from "wdio-vscode-service";

describe("WSFS Explorer", async function () {
    let vscodeWorkspaceRoot: string;
    let workspaceClient: WorkspaceClient;
    let folderName: string;
    let wsfsSection: CustomTreeSection;
    let userName: string;
    const testFileName = "wsfs_e2e_test.py";

    this.timeout(3 * 60 * 1000);

    before(async function () {
        assert(
            process.env.WORKSPACE_PATH,
            "WORKSPACE_PATH env var doesn't exist"
        );
        assert(
            process.env.DATABRICKS_HOST,
            "DATABRICKS_HOST env var doesn't exist"
        );
        assert(
            process.env.DATABRICKS_TOKEN,
            "DATABRICKS_TOKEN env var doesn't exist"
        );

        vscodeWorkspaceRoot = process.env.WORKSPACE_PATH;
        folderName = getUniqueResourceName("wsfs_folder");
        workspaceClient = new WorkspaceClient({
            host: process.env.DATABRICKS_HOST,
            token: process.env.DATABRICKS_TOKEN,
        });

        const me = await workspaceClient.currentUser.me();
        userName = me.userName!;

        await workspaceClient.workspace.mkdirs({
            path: `/Users/${userName}/${folderName}`,
        });

        await writeRootBundleConfig(
            getBasicBundleConfig(),
            vscodeWorkspaceRoot
        );
        await waitForLogin("DEFAULT");
        await dismissNotifications();
        wsfsSection = (await getViewSection(
            "WORKSPACE FILE SYSTEM"
        )) as CustomTreeSection;
    });

    after(async function () {
        const me = await workspaceClient.currentUser.me();
        try {
            await workspaceClient.workspace.delete({
                path: `/Users/${me.userName}/${folderName}`,
                recursive: true,
            });
        } catch {
            // ignore, folder may already be gone
        }
    });

    it("should load the tree view with items", async function () {
        assert(wsfsSection, "WORKSPACE FILE SYSTEM section doesn't exist");

        const hasItems = await browser.waitUntil(
            async () => {
                const items = await wsfsSection.getVisibleItems();
                return items.length > 0;
            },
            {
                timeout: 30_000,
                interval: 1_000,
                timeoutMsg: "WORKSPACE FILE SYSTEM tree view has no items",
            }
        );
        assert(hasItems, "Tree view should have items");

        const items = await wsfsSection.getVisibleItems();
        const labels = await Promise.all(items.map((i) => i.getLabel()));
        assert(
            labels.some((l) => l.includes(folderName)),
            `Expected "${folderName}" in tree view, got: ${labels.join(", ")}`
        );
    });

    it("should create a folder via command", async function () {
        const newFolderName = getUniqueResourceName("wsfs_created");
        const fullPath = `/Users/${userName}/${newFolderName}`;

        await browser.executeWorkbench((vscode) => {
            vscode.commands.executeCommand("databricks.wsfs.createFolder");
        });

        const input = await waitForInput();

        await browser.keys(newFolderName.split(""));
        await input.confirm();

        await browser.waitUntil(
            async () => {
                const items = await wsfsSection.getVisibleItems();
                const labels = await Promise.all(
                    items.map((i) => i.getLabel())
                );
                return labels.some((l) => l === newFolderName);
            },
            {
                timeout: 30_000,
                interval: 1_000,
                timeoutMsg: `Folder "${newFolderName}" did not appear in the tree view`,
            }
        );

        const stat = await workspaceClient.workspace.getStatus({
            path: fullPath,
        });
        assert.strictEqual(stat.object_type, "DIRECTORY");

        // Cleanup
        try {
            await workspaceClient.workspace.delete({
                path: fullPath,
                recursive: true,
            });
        } catch {
            // ignore
        }
    });

    it("should open a file in the editor when clicked in the tree", async function () {
        const filePath = `/Users/${userName}/${folderName}/${testFileName}`;

        // Create the test file via API (folder already exists from the previous test)
        await workspaceClient.workspace.import({
            path: filePath,
            format: "AUTO",
            content: Buffer.from(
                "# e2e test file\nprint('hello wsfs')\n"
            ).toString("base64"),
            overwrite: true,
        });

        // Refresh tree so the new file appears
        await browser.executeWorkbench((vscode) => {
            vscode.commands.executeCommand("databricks.wsfs.refresh");
        });

        // Find folderName, expand it, then locate the child file
        let targetItem: TreeItem | undefined;
        await browser.waitUntil(
            async () => {
                const folder = await wsfsSection.findItem(folderName, 1);
                if (folder && !(await folder.isExpanded())) {
                    await folder.expand();
                }
                targetItem = await wsfsSection.findItem(testFileName);
                return targetItem !== undefined;
            },
            {
                timeout: 30_000,
                interval: 2_000,
                timeoutMsg: `File "${testFileName}" not found in tree`,
            }
        );

        // Click the file to open it (triggers the vscode.open command registered by getTreeItem)
        await targetItem!.select();

        // Wait for an editor tab with the filename to appear
        const tab = await browser.waitUntil(
            async () => {
                try {
                    return await getTabByTitle(testFileName);
                } catch {
                    return undefined;
                }
            },
            {
                timeout: 30_000,
                interval: 1_000,
                timeoutMsg: `Editor tab for "${testFileName}" did not appear`,
            }
        );
        assert(tab, `Editor tab for "${testFileName}" did not appear`);
    });

    it("should edit and save a file, persisting changes to the Databricks workspace", async function () {
        const filePath = `/Users/${userName}/${folderName}/${testFileName}`;
        const newContent = "# edited by e2e test\nprint('updated')\n";

        // Write through the WSFS filesystem provider directly more reliable
        // than clipboard-based editor interaction in headless test environments.
        await browser.executeWorkbench(
            async (vscode, wsfsPath, wsfsContent) => {
                const uri = vscode.Uri.from({
                    scheme: "databricks-wsfs",
                    path: wsfsPath,
                });
                await vscode.workspace.fs.writeFile(
                    uri,
                    Buffer.from(wsfsContent)
                );
            },
            filePath,
            newContent
        );

        await browser.waitUntil(
            async () => {
                const exported = await workspaceClient.workspace.export({
                    path: filePath,
                    format: "AUTO",
                });
                const content = Buffer.from(
                    exported.content ?? "",
                    "base64"
                ).toString();
                return content.includes("edited by e2e test");
            },
            {
                timeout: 30_000,
                interval: 2_000,
                timeoutMsg:
                    "File content did not update in Databricks workspace after save",
            }
        );
    });

    it("should reflect deletion after API delete + refresh", async function () {
        const userName = (await workspaceClient.currentUser.me()).userName;
        const fullPath = `/Users/${userName}/${folderName}`;

        await workspaceClient.workspace.delete({
            path: fullPath,
            recursive: true,
        });

        await browser.executeWorkbench((vscode) => {
            vscode.commands.executeCommand("databricks.wsfs.refresh");
        });

        await browser.waitUntil(
            async () => {
                const items = await wsfsSection.getVisibleItems();
                const labels = await Promise.all(
                    items.map((i) => i.getLabel())
                );
                return !labels.some((l) => l.includes(folderName));
            },
            {
                timeout: 30_000,
                interval: 1_000,
                timeoutMsg: `Folder "${folderName}" is still visible after deletion`,
            }
        );
    });

    it("should refresh the tree view", async function () {
        await browser.executeWorkbench((vscode) => {
            vscode.commands.executeCommand("databricks.wsfs.refresh");
        });

        const hasItems = await browser.waitUntil(
            async () => {
                const items = await wsfsSection.getVisibleItems();
                return items.length > 0;
            },
            {
                timeout: 30_000,
                interval: 1_000,
                timeoutMsg: "Tree view is empty after refresh",
            }
        );
        assert(hasItems, "Tree view should still have items after refresh");
    });
});
