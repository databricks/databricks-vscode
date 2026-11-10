import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { waitForInput } from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { getViewSection } from "./utils/view.ts";

/**
 * The sub-project search, with VS Code's own file search. The folder has no
 * root bundle (`resources/seed/bundle_sub_projects.next/`); `before` adds what
 * git can't hold: `node_modules` and links. The project picker lists:
 * - bundles in plain folders, in order, but not in dot-folders, the user's
 *   `files.exclude` or `node_modules`, and not for a folder named like a
 *   bundle file;
 * - each folder whose bundle file links to a shared one;
 * - a linked folder that is a bundle, but no bundle inside it, and not a
 *   link to a bundle that is found without one;
 * - on macOS and Windows, bundle files in any case.
 */

const OTHER_FOLDER = "Choose another folder";

describe("Bundle sub-projects", async function () {
    let root: string;

    this.timeout(3 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        root = process.env.WORKSPACE_PATH;
        const write = async (file: string) => {
            await fs.mkdir(path.dirname(file), { recursive: true });
            await fs.writeFile(file, `bundle:\n  name: ${path.basename(path.dirname(file))}\n`);
        };
        await write(path.join(root, "node_modules", "pkg", "databricks.yml"));
        for (const folder of ["C", "d"]) {
            await fs.mkdir(path.join(root, folder));
            await fs.symlink(
                path.join("..", "shared", "base.yml"),
                path.join(root, folder, "databricks.yml"),
            );
        }
        const outside = `${root}-outside`;
        await write(path.join(outside, "proj", "databricks.yml"));
        await write(path.join(outside, "proj", "sub", "databricks.yml"));
        await fs.symlink(path.join(outside, "proj"), path.join(root, "linked"));
        await fs.mkdir(path.join(root, "libs"));
        await fs.symlink(path.join("..", "a"), path.join(root, "libs", "a"));
    });

    it("should list the sub-projects in the project picker", async () => {
        const section = await getViewSection("PROJECT");
        assert(section, "PROJECT section doesn't exist");
        const button = await browser.waitUntil(
            async () => {
                const welcome = await section.findWelcomeContent();
                for (const b of (await welcome?.getButtons()) ?? []) {
                    if ((await b.getTitle()) === "Choose a project") {
                        return b;
                    }
                }
                return false;
            },
            {
                timeout: 60_000,
                interval: 1_000,
                timeoutMsg: "PROJECT never offered to choose a project",
            },
        );
        await dismissNotifications();
        await button.elem.click();

        const input = await waitForInput();
        const labels = (
            await Promise.all((await input.getQuickPicks()).map((p) => p.getLabel()))
        ).filter((label) => label !== "" && label !== OTHER_FOLDER);
        const caseless = process.platform === "darwin" || process.platform === "win32";
        assert.deepStrictEqual(labels, ["a", "B", "C", "d", ...(caseless ? ["e"] : []), "linked"]);
        await input.cancel();
    });
});
