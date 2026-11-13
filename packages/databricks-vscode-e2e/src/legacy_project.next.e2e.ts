import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { getBasicBundleConfig, writeRootBundleConfig } from "./utils/bundle-fixtures.ts";
import { getLocalFolderTreeItem } from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { getViewSection } from "./utils/view.ts";

/**
 * The legacy-project notice (SHELL-07). The folder
 * starts with an extension 1.x `.databricks/project.json` and no bundle
 * (`resources/seed/legacy_project.next/`). PROJECT says the project is
 * no longer migrated and links to the docs; nothing is written; a bundle
 * replaces the notice with the project.
 */

const NOTICE = "This folder has a Databricks project configuration (.databricks/project.json)";

async function welcomeText(): Promise<string> {
    const section = await getViewSection("PROJECT");
    assert(section, "PROJECT section doesn't exist");
    const welcome = await section.findWelcomeContent();
    return (await welcome?.getTextSections())?.join("\n") ?? "";
}

describe("Legacy project notice", async function () {
    let root: string;

    this.timeout(3 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        root = process.env.WORKSPACE_PATH;
        // The seed made it before VS Code started, so `workspaceContains:.databricks` activated the extension.
        await fs.access(path.join(root, ".databricks", "project.json"));
    });

    it("should show the notice with a link to the docs", async () => {
        await browser.waitUntil(async () => (await welcomeText()).includes(NOTICE), {
            timeout: 60_000,
            interval: 1_000,
            timeoutMsg: "PROJECT never showed the legacy-project notice",
        });
        const section = await getViewSection("PROJECT");
        // The buttons can render before their titles do.
        let buttons: string[] = [];
        await browser
            .waitUntil(
                async () => {
                    const welcome = await section!.findWelcomeContent();
                    buttons = await Promise.all(
                        ((await welcome?.getButtons()) ?? []).map((b) => b.getTitle()),
                    );
                    return buttons.includes("Learn how to migrate");
                },
                { timeout: 30_000, interval: 1_000 },
            )
            .catch(() => undefined);
        assert(
            buttons.includes("Learn how to migrate"),
            `No "Learn how to migrate" button: ${buttons.join(", ")}`,
        );
        await dismissNotifications();
    });

    it("should leave the old configuration alone", async () => {
        assert.deepStrictEqual(await fs.readdir(path.join(root, ".databricks")), ["project.json"]);
    });

    it("should open the project once it has a bundle", async () => {
        await writeRootBundleConfig(getBasicBundleConfig({}, false), root);
        await browser.waitUntil(async () => (await getLocalFolderTreeItem(root)) !== undefined, {
            timeout: 60_000,
            interval: 1_000,
            timeoutMsg: "The project never opened",
        });
        assert(!(await welcomeText()).includes(NOTICE), "The notice still shows");
    });
});
