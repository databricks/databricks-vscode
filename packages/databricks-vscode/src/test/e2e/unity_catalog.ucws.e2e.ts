import assert from "node:assert";
import {
    dismissNotifications,
    getTabByTitle,
    waitForLogin,
} from "./utils/commonUtils.ts";
import {
    getBasicBundleConfig,
    writeRootBundleConfig,
} from "./utils/dabsFixtures.ts";
import {
    findUCItem,
    getUCSection,
    getVisibleLabels,
} from "./utils/unityCatalogUtils.ts";

describe("Unity Catalog tree view", async function () {
    this.timeout(3 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        await writeRootBundleConfig(
            getBasicBundleConfig(),
            process.env.WORKSPACE_PATH
        );
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
        let children: Awaited<ReturnType<typeof section.openItem>> = [];
        await browser.waitUntil(
            async () => {
                children = await section.openItem("system");
                return children.length > 0;
            },
            {
                timeout: 30_000,
                interval: 2000,
                timeoutMsg: "No schemas found under 'system' catalog",
            }
        );
        const labels = await Promise.all(children.map((c) => c.getLabel()));
        assert(
            labels.includes("access"),
            `Schema 'access' not found. Got: ${labels.join(", ")}`
        );
    });

    it("should expand 'system.access' schema to show group nodes or tables", async () => {
        const section = await getUCSection();
        let children: Awaited<ReturnType<typeof section.openItem>> = [];
        await browser.waitUntil(
            async () => {
                children = await section.openItem("system", "access");
                return children.length > 0;
            },
            {
                timeout: 30_000,
                interval: 2000,
                timeoutMsg: "No items found under 'system.access'",
            }
        );
        assert(children.length > 0, "system.access has no children");
    });

    it("should expand Tables group in 'system.access' if grouped", async () => {
        const section = await getUCSection();
        let accessChildren: Awaited<ReturnType<typeof section.openItem>> = [];
        await browser.waitUntil(
            async () => {
                accessChildren = await section.openItem("system", "access");
                return accessChildren.length > 0;
            },
            {
                timeout: 30_000,
                interval: 2000,
                timeoutMsg: "system.access has no children",
            }
        );

        const labels = await Promise.all(
            accessChildren.map((c) => c.getLabel())
        );
        const groupLabel = labels.find((l) => l.startsWith("Tables ("));
        if (!groupLabel) {
            // Schema uses flat list — nothing to test here
            return;
        }

        let tableChildren: Awaited<ReturnType<typeof section.openItem>> = [];
        await browser.waitUntil(
            async () => {
                tableChildren = await section.openItem(
                    "system",
                    "access",
                    groupLabel
                );
                return tableChildren.length > 0;
            },
            {
                timeout: 15_000,
                interval: 1000,
                timeoutMsg: `No tables found under ${groupLabel}`,
            }
        );
        assert(tableChildren.length > 0, `${groupLabel} has no table items`);
    });

    it("should expand a table in 'system.access' to show columns with type descriptions", async () => {
        const section = await getUCSection();

        let accessChildren: Awaited<ReturnType<typeof section.openItem>> = [];
        await browser.waitUntil(
            async () => {
                accessChildren = await section.openItem("system", "access");
                return accessChildren.length > 0;
            },
            {
                timeout: 30_000,
                interval: 2000,
                timeoutMsg: "system.access has no children",
            }
        );

        const accessLabels = await Promise.all(
            accessChildren.map((c) => c.getLabel())
        );
        const groupLabel = accessLabels.find((l) => l.startsWith("Tables ("));

        let tableName: string;
        if (groupLabel) {
            let tableChildren: Awaited<ReturnType<typeof section.openItem>> =
                [];
            await browser.waitUntil(
                async () => {
                    tableChildren = await section.openItem(
                        "system",
                        "access",
                        groupLabel
                    );
                    return tableChildren.length > 0;
                },
                {
                    timeout: 15_000,
                    interval: 1000,
                    timeoutMsg: "Tables group is empty",
                }
            );
            tableName = await tableChildren[0].getLabel();
        } else {
            tableName = accessLabels[0];
        }

        const colPath: [string, ...string[]] = groupLabel
            ? ["system", "access", groupLabel, tableName]
            : ["system", "access", tableName];

        let columns: Awaited<ReturnType<typeof section.openItem>> = [];
        await browser.waitUntil(
            async () => {
                columns = await section.openItem(...colPath);
                return columns.length > 0;
            },
            {
                timeout: 30_000,
                interval: 2000,
                timeoutMsg: `No columns loaded for table '${tableName}'`,
            }
        );

        const firstColDesc = await columns[0].getDescription();
        assert(
            firstColDesc && firstColDesc.length > 0,
            `First column of '${tableName}' has no type description`
        );
    });

    it("should open detail panel when clicking a table", async () => {
        const section = await getUCSection();

        let accessChildren: Awaited<ReturnType<typeof section.openItem>> = [];
        await browser.waitUntil(
            async () => {
                accessChildren = await section.openItem("system", "access");
                return accessChildren.length > 0;
            },
            {
                timeout: 30_000,
                interval: 2000,
                timeoutMsg: "system.access has no children",
            }
        );

        const accessLabels = await Promise.all(
            accessChildren.map((c) => c.getLabel())
        );
        const groupLabel = accessLabels.find((l) => l.startsWith("Tables ("));

        let tableItem: (typeof accessChildren)[0];
        if (groupLabel) {
            let tableChildren: Awaited<ReturnType<typeof section.openItem>> =
                [];
            await browser.waitUntil(
                async () => {
                    tableChildren = await section.openItem(
                        "system",
                        "access",
                        groupLabel
                    );
                    return tableChildren.length > 0;
                },
                {
                    timeout: 15_000,
                    interval: 1000,
                    timeoutMsg: "Tables group is empty",
                }
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
        const systemItem = await findUCItem(section, "system");

        await systemItem.elem.moveTo();
        const pinBtn = await systemItem.getActionButton("Add to Favorites");
        assert(
            pinBtn,
            "'Add to Favorites' action button not found on 'system'"
        );
        await pinBtn.elem.click();

        await browser.waitUntil(
            async () => {
                const labels = await getVisibleLabels(section);
                return labels.includes("Favorites");
            },
            {
                timeout: 10_000,
                interval: 500,
                timeoutMsg:
                    "'Favorites' group did not appear after pinning 'system'",
            }
        );
    });

    it("should unpin 'system' catalog and remove Favorites group", async () => {
        const section = await getUCSection();
        const systemItem = await findUCItem(section, "system");

        await systemItem.elem.moveTo();
        const unpinBtn = await systemItem.getActionButton(
            "Remove from Favorites"
        );
        assert(
            unpinBtn,
            "'Remove from Favorites' action button not found on 'system'"
        );
        await unpinBtn.elem.click();

        await browser.waitUntil(
            async () => {
                const labels = await getVisibleLabels(section);
                return !labels.includes("Favorites");
            },
            {
                timeout: 10_000,
                interval: 500,
                timeoutMsg:
                    "'Favorites' group did not disappear after unpinning 'system'",
            }
        );
    });
});
