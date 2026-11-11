import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import type { CustomTreeSection, TreeItem } from "wdio-vscode-service";
import {
    getBasicBundleConfig,
    getUniqueResourceName,
    writeRootBundleConfig,
} from "./utils/bundle-fixtures.ts";
import { getActionButton, getConfigurationItem, waitForLogin } from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { getViewSection } from "./utils/view.ts";
import { WorkspaceClient } from "./utils/workspace-client.ts";

/**
 * The Compute view behind the `views.cluster` experiment
 * (SHELL-11, COMP-07), attaching from it and detaching (COMP-04), and
 * starting and stopping the attached cluster from the Cluster row
 * (COMP-05), which no frozen spec covers.
 *
 * The last test needs a cluster it may start and stop, named by
 * TEST_STOPPABLE_CLUSTER_ID; without it the test is skipped, so a shared
 * TEST_DEFAULT_CLUSTER_ID is never stopped. The mock run sets it.
 */
describe("Compute view and cluster lifecycle", async function () {
    let root: string;
    let client: WorkspaceClient;
    let sharedName: string;

    this.timeout(15 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        assert(process.env.TEST_DEFAULT_CLUSTER_ID, "TEST_DEFAULT_CLUSTER_ID doesn't exist");
        root = process.env.WORKSPACE_PATH;
        client = new WorkspaceClient({ profile: "DEFAULT" });
        const shared = await client.clusters.get({
            clusterId: process.env.TEST_DEFAULT_CLUSTER_ID,
        });
        assert(shared.clusterName, "The shared cluster has no name");
        sharedName = shared.clusterName;
        await writeRootBundleConfig(
            getBasicBundleConfig(
                { bundle: { name: getUniqueResourceName("compute_lifecycle") } },
                false,
            ),
            root,
        );
        await waitForLogin("DEFAULT");
        await dismissNotifications();
    });

    const overrides = async () => {
        const file = path.join(root, ".databricks", "bundle", "dev_test", "vscode.overrides.json");
        return JSON.parse(await fs.readFile(file, "utf-8").catch(() => "{}")) as {
            clusterId?: string;
        };
    };

    async function waitForClusterRow(description: string | undefined) {
        let last: string | undefined;
        await browser.waitUntil(
            async () => {
                const item = await getConfigurationItem(
                    description === undefined ? "select compute" : "cluster",
                );
                last = item === undefined ? undefined : await item.getDescription();
                return item !== undefined && (description === undefined || last === description);
            },
            {
                timeout: 60_000,
                interval: 1_000,
                timeoutMsg: `The Cluster row never showed "${description ?? "Select compute"}"; it shows "${last}"`,
            },
        );
    }

    async function computeItem(name: string): Promise<TreeItem> {
        const section = (await getViewSection("COMPUTE")) as CustomTreeSection;
        let found: TreeItem | undefined;
        await browser.waitUntil(
            async () => {
                for (const item of await section.getVisibleItems()) {
                    if ((await item.getLabel()) === name) {
                        found = item as TreeItem;
                        return true;
                    }
                }
                return false;
            },
            {
                timeout: 60_000,
                interval: 1_000,
                timeoutMsg: `The Compute view doesn't list "${name}"`,
            },
        );
        return found!;
    }

    async function attachFromComputeView(name: string) {
        const item = await computeItem(name);
        await item.elem.moveTo();
        const attach = await getActionButton(item, "Attach compute");
        assert(attach, `"${name}" has no "Attach compute" action`);
        await attach.click();
        await waitForClusterRow(name);
    }

    async function clickClusterRowAction(label: string) {
        await (await findClusterRowAction(label)).click();
    }

    async function findClusterRowAction(label: string): Promise<WebdriverIO.Element> {
        let button: WebdriverIO.Element | undefined;
        await browser.waitUntil(
            async () => {
                const row = await getConfigurationItem("cluster");
                if (row === undefined) {
                    return false;
                }
                await row.elem.moveTo();
                button = await getActionButton(row, label);
                return button !== undefined;
            },
            {
                timeout: 60_000,
                interval: 1_000,
                timeoutMsg: `The Cluster row has no "${label}" action`,
            },
        );
        return button!;
    }

    it("should show the Compute view behind the views.cluster experiment (SHELL-11, COMP-07)", async () => {
        await browser.executeWorkbench(async (vscode) => {
            await vscode.workspace
                .getConfiguration("databricks")
                .update(
                    "experiments.optInto",
                    ["views.cluster"],
                    vscode.ConfigurationTarget.Workspace,
                );
        });
        await computeItem(sharedName);
    });

    it("should attach a cluster from the Compute view (COMP-04)", async () => {
        await attachFromComputeView(sharedName);
        assert.strictEqual((await overrides()).clusterId, process.env.TEST_DEFAULT_CLUSTER_ID);
    });

    it("should detach it again (COMP-04)", async () => {
        await browser.executeWorkbench(async (vscode) => {
            await vscode.commands.executeCommand("databricks.connection.detachCluster");
        });
        await waitForClusterRow(undefined);
        assert.strictEqual((await overrides()).clusterId, undefined);
    });

    it("should start and stop the attached cluster from the Cluster row (COMP-05)", async function () {
        const clusterId = process.env.TEST_STOPPABLE_CLUSTER_ID;
        if (!clusterId) {
            this.skip();
        }
        const cluster = await client.clusters.get({ clusterId });
        assert(cluster.clusterName, "The stoppable cluster has no name");
        const waitForState = async (state: string) =>
            browser.waitUntil(
                async () => (await client.clusters.get({ clusterId })).state === state,
                {
                    timeout: 12 * 60 * 1000,
                    interval: 5_000,
                    timeoutMsg: `${cluster.clusterName} never reached ${state}`,
                },
            );
        await attachFromComputeView(cluster.clusterName);
        if (cluster.state !== "TERMINATED") {
            // Start from a stopped cluster, so both actions run.
            await clickClusterRowAction("Stop Compute");
            await waitForState("TERMINATED");
        }

        await clickClusterRowAction("Start Compute");
        await waitForState("RUNNING");
        // The row follows the state: a running cluster offers Stop, a stopped one Start.
        await clickClusterRowAction("Stop Compute");
        await waitForState("TERMINATED");
        await findClusterRowAction("Start Compute");
    });
});
