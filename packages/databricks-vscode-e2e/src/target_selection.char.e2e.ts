import assert from "node:assert";
import type { CustomTreeSection, TreeItem } from "wdio-vscode-service";
import {
    getBasicBundleConfig,
    getUniqueResourceName,
    profileHost,
    writeRootBundleConfig,
} from "./utils/bundle-fixtures.ts";
import { getConfigurationItem, waitForInput, waitForLogin } from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { getViewSection, VARIABLES } from "./utils/view.ts";

/**
 * Characterization spec: target selection (SHELL-06)
 * had no e2e coverage, and the rewrite stores the target per project rather
 * than per window. The bundle has `dev_test`, the default, and
 * `dev_test2`, with a different value for one variable. Picking `dev_test2`
 * changes the Target row and the Variables group, and an edit to the bundle
 * keeps it.
 */
describe("Select a bundle target", async function () {
    this.timeout(3 * 60 * 1000);

    const bundleName = getUniqueResourceName("target_selection");

    /** `waitUntil`, failing with the last value seen rather than a fixed message. */
    async function waitFor(
        what: string,
        read: () => Promise<string | undefined>,
        expected: string,
    ) {
        let last: string | undefined;
        try {
            await browser.waitUntil(async () => (last = await read()) === expected, {
                timeout: 60_000,
                interval: 1_000,
            });
        } catch {
            throw new Error(`${what} never showed "${expected}"; it shows "${last}"`);
        }
    }

    async function waitForTarget(name: string) {
        await waitFor(
            "The Target row",
            async () => {
                const item = await getConfigurationItem("Target");
                const row =
                    item === undefined
                        ? undefined
                        : `${await item.getLabel()}: ${await item.getDescription()}`;
                console.log("Target row:", row);
                return row;
            },
            `Target: ${name}`,
        );
    }

    async function waitForVariable(name: string, value: string) {
        await waitFor(
            `Variable ${name}`,
            async () => {
                const section = (await getViewSection("PROJECT")) as CustomTreeSection;
                for (const item of (await section.openItem(VARIABLES)) as TreeItem[]) {
                    if ((await item.getLabel()) === name) {
                        return item.getDescription();
                    }
                }
                return undefined;
            },
            value,
        );
    }

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        const host = process.env.DATABRICKS_HOST ?? profileHost();
        const config = getBasicBundleConfig({
            bundle: { name: bundleName },
            variables: { greeting: { default: "hello" } },
            targets: {
                dev_test2: {
                    mode: "development",
                    workspace: { host },
                    variables: { greeting: "bonjour" },
                },
            },
        });
        await writeRootBundleConfig(config, process.env.WORKSPACE_PATH);
        await dismissNotifications();
    });

    it("should start on the default target", async () => {
        await waitForLogin("DEFAULT");
        await waitForTarget("dev_test");
        await waitForVariable("greeting", "hello");
    });

    it("should switch to the target picked in the target picker", async () => {
        // Not awaited: the command resolves only once the picker closes.
        await browser.executeWorkbench((vscode) => {
            void vscode.commands.executeCommand("databricks.connection.bundle.selectTarget");
        });
        const input = await waitForInput();
        assert(await input.findQuickPick("dev_test2"), "dev_test2 is absent in the target picker");
        await input.selectQuickPick("dev_test2");

        await waitForTarget("dev_test2");
        await waitForVariable("greeting", "bonjour");
    });

    it("should keep the target when the bundle changes", async () => {
        const host = process.env.DATABRICKS_HOST ?? profileHost();
        await writeRootBundleConfig(
            getBasicBundleConfig({
                bundle: { name: bundleName },
                variables: { greeting: { default: "hello" } },
                targets: {
                    dev_test2: {
                        mode: "development",
                        workspace: { host },
                        variables: { greeting: "salut" },
                    },
                },
            }),
            process.env.WORKSPACE_PATH!,
        );
        await waitForVariable("greeting", "salut");
        await waitForTarget("dev_test2");
    });

    // Restarting VS Code should keep dev_test2 too. That
    // can't pass in this harness: wdio-vscode-service runs VS Code in
    // extension-test mode, whose storage is in memory, so no workspace state
    // survives `browser.reloadSession()`. ProjectService's
    // unit tests cover the stored choice instead.
});
