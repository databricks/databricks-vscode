import assert from "node:assert";
import {
    getBasicBundleConfig,
    getUniqueResourceName,
    writeRootBundleConfig,
} from "./utils/bundle-fixtures.ts";
import { waitForInput, waitForLogin } from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { getTabByTitle } from "./utils/editor.ts";
import { getViewSection } from "./utils/view.ts";
import { WorkspaceClient } from "./utils/workspace-client.ts";

/**
 * Characterization spec: creating a workspace file
 * (WSFS-03) was only partly covered, and the file system moves to a new API
 * client. `databricks.wsfs.createNewFile` with a `.py` name creates the file
 * (checked through the API) and opens it in an editor tab; a `.ipynb` name
 * creates an empty notebook, stored without the extension.
 */
describe("Create a workspace file", async function () {
    let workspaceClient: WorkspaceClient;
    let home: string;
    const created: string[] = [];

    this.timeout(3 * 60 * 1000);

    async function createNewFile(name: string) {
        await browser.executeWorkbench((vscode) => {
            vscode.commands.executeCommand("databricks.wsfs.createNewFile");
        });
        const input = await waitForInput();
        // The project folder's name is preselected; typing replaces it.
        await browser.keys(name.split(""));
        await input.confirm();
    }

    async function waitForObject(path: string) {
        return await browser.waitUntil(
            async () => {
                try {
                    return await workspaceClient.workspace.getStatus({ path });
                } catch {
                    return undefined;
                }
            },
            { timeout: 30_000, interval: 1_000, timeoutMsg: `${path} wasn't created` },
        );
    }

    before(async function () {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH env var doesn't exist");
        workspaceClient = new WorkspaceClient({ profile: "DEFAULT" });
        home = `/Users/${(await workspaceClient.currentUser.me()).userName}`;
        await workspaceClient.workspace.mkdirs({ path: home });
        await writeRootBundleConfig(getBasicBundleConfig(), process.env.WORKSPACE_PATH);
        await waitForLogin("DEFAULT");
        await dismissNotifications();
        assert(
            await getViewSection("WORKSPACE FILE SYSTEM"),
            "WORKSPACE FILE SYSTEM section doesn't exist",
        );
    });

    after(async function () {
        for (const path of created) {
            try {
                await workspaceClient.workspace.delete({ path });
            } catch {
                // ignore, it may not have been created
            }
        }
    });

    it("should create a .py file and open it in an editor", async function () {
        const name = `${getUniqueResourceName("wsfs_char")}.py`;
        created.push(`${home}/${name}`);

        await createNewFile(name);

        const stat = await waitForObject(`${home}/${name}`);
        assert.strictEqual(stat.object_type, "FILE");
        const tab = await browser.waitUntil(
            async () => {
                try {
                    return await getTabByTitle(name);
                } catch {
                    return undefined;
                }
            },
            {
                timeout: 30_000,
                interval: 1_000,
                timeoutMsg: `Editor tab for "${name}" did not appear`,
            },
        );
        assert(tab);
    });

    it("should create a .ipynb as an empty notebook", async function () {
        const stem = getUniqueResourceName("wsfs_char_nb");
        created.push(`${home}/${stem}`);

        await createNewFile(`${stem}.ipynb`);

        const stat = await waitForObject(`${home}/${stem}`);
        assert.strictEqual(stat.object_type, "NOTEBOOK");
        const exported = await workspaceClient.workspace.export({
            path: `${home}/${stem}`,
            format: "JUPYTER",
        });
        const notebook = JSON.parse(Buffer.from(exported.content ?? "", "base64").toString()) as {
            cells?: { source?: string | string[] }[];
        };
        const code = (notebook.cells ?? [])
            .map((c) => (Array.isArray(c.source) ? c.source.join("") : (c.source ?? "")))
            .join("");
        assert.strictEqual(code.trim(), "", `The new notebook isn't empty: ${code}`);

        // The notebook opens in the browser; close VS Code's prompt to open the link, if it shows.
        await browser.keys(["Escape"]);
    });
});
