import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { InputBox, type CustomTreeSection, type TreeItem } from "wdio-vscode-service";
import {
    getBasicBundleConfig,
    getUniqueResourceName,
    writeRootBundleConfig,
} from "./utils/bundle-fixtures.ts";
import { waitForLogin } from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { openContextMenu } from "./utils/context-menu.ts";
import { getViewSection } from "./utils/view.ts";
import { WorkspaceClient } from "./utils/workspace-client.ts";

/**
 * The WORKSPACE FILE SYSTEM view's item actions (WSFS-04), which
 * no frozen spec covers: Copy Path, Download and Upload File, from the
 * items' context menus. Delete asks in a modal, which VS Code refuses to show
 * in a test host ("DialogService: refused to show dialog in tests"), so it
 * stays unit-tested. The file dialogs are VS Code's simple ones
 * (`files.simpleDialog.enable`), so the spec can type a path. The API says
 * what changed in the workspace.
 */
describe("Workspace file system actions", async function () {
    let root: string;
    let client: WorkspaceClient;
    let folderName: string;
    let folderPath: string;
    let section: CustomTreeSection;
    const fileName = "wsfs_actions.py";
    const content = "# e2e wsfs actions\nprint('hello')\n";

    this.timeout(5 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        root = process.env.WORKSPACE_PATH;
        client = new WorkspaceClient({ profile: "DEFAULT" });
        const me = await client.currentUser.me();
        folderName = getUniqueResourceName("wsfs_actions");
        folderPath = `/Users/${me.userName}/${folderName}`;
        await client.workspace.mkdirs({ path: folderPath });
        await client.workspace.import({
            path: `${folderPath}/${fileName}`,
            format: "AUTO",
            content: Buffer.from(content).toString("base64"),
            overwrite: true,
        });
        await writeRootBundleConfig(getBasicBundleConfig({}, false), root);
        await waitForLogin("DEFAULT");
        await dismissNotifications();
        await browser.executeWorkbench(async (vscode) => {
            await vscode.workspace
                .getConfiguration("files")
                .update("simpleDialog.enable", true, vscode.ConfigurationTarget.Global);
        });
        section = (await getViewSection("WORKSPACE FILE SYSTEM")) as CustomTreeSection;
        assert(section, "WORKSPACE FILE SYSTEM doesn't exist");
    });

    after(async () => {
        await client.workspace.delete({ path: folderPath, recursive: true }).catch(() => {});
    });

    /** The item `name` in the test folder, or the folder itself; refreshes until it shows. */
    async function item(name?: string): Promise<TreeItem> {
        let found: TreeItem | undefined;
        await browser.waitUntil(
            async () => {
                const folder = (await section.findItem(folderName)) as TreeItem | undefined;
                if (folder === undefined || name === undefined) {
                    found = folder;
                } else {
                    await folder.expand();
                    found = (await folder.findChildItem(name)) as TreeItem | undefined;
                }
                if (found === undefined) {
                    await browser.executeWorkbench(async (vscode) => {
                        await vscode.commands.executeCommand("databricks.wsfs.refresh");
                    });
                }
                return found !== undefined;
            },
            {
                timeout: 30_000,
                interval: 2_000,
                timeoutMsg: `"${name ?? folderName}" isn't in the tree`,
            },
        );
        return found!;
    }

    async function runFromContextMenu(target: TreeItem, action: string) {
        const menu = await openContextMenu(target);
        await menu.select(action);
    }

    /** Types `file` into VS Code's simple open dialog and accepts it. */
    async function answerOpenDialog(file: string) {
        const input = await new InputBox((await browser.getWorkbench()).locatorMap).wait();
        await input.setText(file);
        await input.confirm();
    }

    const status = (p: string) => client.workspace.getStatus({ path: p }).catch(() => undefined);

    it("should copy an item's path", async () => {
        await runFromContextMenu(await item(fileName), "Copy Path");
        await browser.waitUntil(
            async () =>
                (await browser.executeWorkbench((vscode) => vscode.env.clipboard.readText())) ===
                `${folderPath}/${fileName}`,
            { timeout: 10_000, timeoutMsg: "The clipboard doesn't hold the file's path" },
        );
    });

    it("should download a file", async () => {
        const target = path.join(root, "downloaded.py");
        await runFromContextMenu(await item(fileName), "Download");
        // The save dialog starts in the project folder with the file's base name selected.
        await new InputBox((await browser.getWorkbench()).locatorMap).wait();
        await browser.keys("downloaded".split(""));
        await new Promise((r) => setTimeout(r, 1000));
        await browser.keys(["Enter"]);
        const downloaded = await browser.waitUntil(
            () => fs.readFile(target, "utf-8").catch(() => false as const),
            {
                timeout: 30_000,
                timeoutMsg: "The file wasn't downloaded",
            },
        );
        assert.strictEqual(downloaded, content);
    });

    it("should upload a file into a folder", async () => {
        const local = path.join(root, "uploaded_e2e.py");
        await fs.writeFile(local, "print('uploaded')\n");
        await runFromContextMenu(await item(), "Upload File");
        await answerOpenDialog(local);
        await browser.waitUntil(
            async () => (await status(`${folderPath}/uploaded_e2e.py`)) !== undefined,
            {
                timeout: 30_000,
                timeoutMsg: "The file wasn't uploaded",
            },
        );
        await item("uploaded_e2e.py");
    });
});
