import assert from "node:assert";
import type { CustomTreeSection } from "wdio-vscode-service";
import { getActionButton, waitForLogin } from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { getTabByTitle } from "./utils/editor.ts";
import { getBasicBundleConfig, writeRootBundleConfig } from "./utils/bundle-fixtures.ts";
import { waitUntilSeen } from "./utils/wait.ts";
import {
    findUCItem,
    getUCSection,
    getTopVisibleLabels,
    openUCPath,
} from "./utils/unity-catalog.ts";

/** Expands `system.access`, waiting until it has loaded children. */
async function openSystemAccess(section: CustomTreeSection) {
    let children: Awaited<ReturnType<typeof openUCPath>> = [];
    await browser.waitUntil(
        async () => {
            children = await openUCPath(section, "system", "access");
            return children.length > 0;
        },
        {
            timeout: 30_000,
            interval: 2000,
            timeoutMsg: "system.access has no children",
        },
    );
    return children;
}

/**
 * Clicks the `system` catalog row's inline action `label`. VS Code shows a row's inline actions
 * only while the row is hovered, and the tree's virtual list re-renders rows as it settles after a
 * scroll, reusing a row's element for another row. On Windows CI the button found right after the
 * hover was hidden again by the time the click reached it ("did not become interactable"), so each
 * try finds and hovers the row again, and clicks only a button that is clickable then.
 */
async function clickSystemAction(section: CustomTreeSection, label: string) {
    let seen = "no try finished";
    await waitUntilSeen(
        async () => {
            try {
                const systemItem = await findUCItem(section, "system");
                await systemItem.elem.scrollIntoView({ block: "nearest" });
                await browser.pause(200);
                await systemItem.elem.moveTo();
                await browser.pause(500); // wait for hover action buttons to render
                if ((await systemItem.getLabel()) !== "system") {
                    seen = `the hovered row showed "${await systemItem.getLabel()}"`;
                    return false;
                }
                const button = await getActionButton(systemItem, label);
                if (!button) {
                    seen = `'system' had no "${label}" action`;
                    return false;
                }
                if (!(await button.isClickable())) {
                    seen = `'system' had a "${label}" action that wasn't clickable`;
                    return false;
                }
                await button.click();
                return true;
            } catch (e) {
                seen = `a try failed: ${e instanceof Error ? e.message : String(e)}`;
                return false;
            }
        },
        {
            timeout: 90_000,
            interval: 1_000,
            timeoutMsg: `Couldn't click "${label}" on 'system'`,
        },
        () => seen,
    );
}

describe("Unity Catalog tree view", async function () {
    this.timeout(3 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        await writeRootBundleConfig(getBasicBundleConfig(), process.env.WORKSPACE_PATH);
        await waitForLogin("DEFAULT");
        await dismissNotifications();
    });

    it("should show UNITY CATALOG section after login", async () => {
        const section = await getUCSection();
        assert(section, "UNITY CATALOG section not found");
    });

    it("should list 'system' catalog in the tree", async () => {
        const section = await getUCSection();
        await findUCItem(section, "system");
    });

    it("should expand 'system' catalog to show schemas including 'access'", async () => {
        const section = await getUCSection();
        let children: Awaited<ReturnType<typeof openUCPath>> = [];
        await browser.waitUntil(
            async () => {
                children = await openUCPath(section, "system");
                return children.length > 0;
            },
            {
                timeout: 30_000,
                interval: 2000,
                timeoutMsg: "No schemas found under 'system' catalog",
            },
        );
        const labels = await Promise.all(children.map((c) => c.getLabel()));
        assert(labels.includes("access"), `Schema 'access' not found. Got: ${labels.join(", ")}`);
    });

    it("should expand 'system.access' schema to show group nodes or tables", async () => {
        const section = await getUCSection();
        let children: Awaited<ReturnType<typeof openUCPath>> = [];
        await browser.waitUntil(
            async () => {
                children = await openUCPath(section, "system", "access");
                return children.length > 0;
            },
            {
                timeout: 30_000,
                interval: 2000,
                timeoutMsg: "No items found under 'system.access'",
            },
        );
        assert(children.length > 0, "system.access has no children");
    });

    it("should expand Tables group in 'system.access' if grouped", async () => {
        const section = await getUCSection();
        const accessChildren = await openSystemAccess(section);

        const labels = await Promise.all(accessChildren.map((c) => c.getLabel()));
        const groupLabel = labels.find((l) => l.startsWith("Tables ("));
        if (!groupLabel) {
            // Schema uses flat list — nothing to test here
            return;
        }

        let tableChildren: Awaited<ReturnType<typeof openUCPath>> = [];
        await browser.waitUntil(
            async () => {
                tableChildren = await openUCPath(section, "system", "access", groupLabel);
                return tableChildren.length > 0;
            },
            {
                timeout: 15_000,
                interval: 1000,
                timeoutMsg: `No tables found under ${groupLabel}`,
            },
        );
        assert(tableChildren.length > 0, `${groupLabel} has no table items`);
    });

    // TODO: Skipped — fails consistently in CI (every run on both
    // shards, not intermittent). The extension loads the columns correctly
    // (TablesService.get returns them and the detail-panel test reads them
    // fine), but the shared test workspace has ~800 sibling catalogs that push
    // `system` to the bottom of the tree, so a table's column rows land one row
    // past VS Code's ~25-row virtualised window and never render in the DOM —
    // getChildren() then returns []. Re-enable once the test workspace is
    // isolated/cleaned or the helper can reliably drive Monaco's virtual list
    // to a deep node without disturbing sibling tests.
    it.skip("should expand a table in 'system.access' to show columns with type descriptions", async () => {
        const section = await getUCSection();

        const accessChildren = await openSystemAccess(section);

        const accessLabels = await Promise.all(accessChildren.map((c) => c.getLabel()));
        const groupLabel = accessLabels.find((l) => l.startsWith("Tables ("));

        let tableName: string;
        if (groupLabel) {
            let tableChildren: Awaited<ReturnType<typeof openUCPath>> = [];
            await browser.waitUntil(
                async () => {
                    tableChildren = await openUCPath(section, "system", "access", groupLabel);
                    return tableChildren.length > 0;
                },
                {
                    timeout: 15_000,
                    interval: 1000,
                    timeoutMsg: "Tables group is empty",
                },
            );
            tableName = await tableChildren[0].getLabel();
        } else {
            tableName = accessLabels[0];
        }

        const colPath: [string, ...string[]] = groupLabel
            ? ["system", "access", groupLabel, tableName]
            : ["system", "access", tableName];

        let columns: Awaited<ReturnType<typeof openUCPath>> = [];
        await browser.waitUntil(
            async () => {
                columns = await openUCPath(section, ...colPath);
                return columns.length > 0;
            },
            {
                timeout: 30_000,
                interval: 2000,
                timeoutMsg: `No columns loaded for table '${tableName}'`,
            },
        );

        const firstColDesc = await columns[0].getDescription();
        assert(
            firstColDesc && firstColDesc.length > 0,
            `First column of '${tableName}' has no type description`,
        );
    });

    it("should open detail panel when clicking a table", async () => {
        const section = await getUCSection();

        const accessChildren = await openSystemAccess(section);

        const accessLabels = await Promise.all(accessChildren.map((c) => c.getLabel()));
        const groupLabel = accessLabels.find((l) => l.startsWith("Tables ("));

        let tableItem: (typeof accessChildren)[0];
        if (groupLabel) {
            let tableChildren: Awaited<ReturnType<typeof openUCPath>> = [];
            await browser.waitUntil(
                async () => {
                    tableChildren = await openUCPath(section, "system", "access", groupLabel);
                    return tableChildren.length > 0;
                },
                {
                    timeout: 15_000,
                    interval: 1000,
                    timeoutMsg: "Tables group is empty",
                },
            );
            tableItem = tableChildren[0];
        } else {
            tableItem = accessChildren[0];
        }

        await tableItem.select();
        await getTabByTitle("Table:");
    });

    it("should pin 'system' catalog and show Favorites group", async () => {
        const section = await getUCSection();
        await clickSystemAction(section, "Add to Favorites");

        await browser.waitUntil(
            async () => {
                // Scroll to top: "Favorites" group appears at the top of the
                // tree and may not be in the viewport after scrolling to "system".
                const labels = await getTopVisibleLabels(section);
                return labels.includes("Favorites");
            },
            {
                timeout: 10_000,
                interval: 500,
                timeoutMsg: "'Favorites' group did not appear after pinning 'system'",
            },
        );
    });

    it("should unpin 'system' catalog and remove Favorites group", async () => {
        const section = await getUCSection();
        await clickSystemAction(section, "Remove from Favorites");

        await browser.waitUntil(
            async () => {
                // Scroll to top so we can confirm "Favorites" is truly gone.
                const labels = await getTopVisibleLabels(section);
                return !labels.includes("Favorites");
            },
            {
                timeout: 10_000,
                interval: 500,
                timeoutMsg: "'Favorites' group did not disappear after unpinning 'system'",
            },
        );
    });
});
