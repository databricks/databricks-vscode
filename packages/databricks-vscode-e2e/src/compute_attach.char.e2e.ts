import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import {
    getBasicBundleConfig,
    getUniqueResourceName,
    writeRootBundleConfig,
} from "./utils/bundle-fixtures.ts";
import {
    executeCommandWhenAvailable,
    getConfigurationItem,
    waitForInput,
    waitForLogin,
} from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { getViewSection } from "./utils/view.ts";
import { WorkspaceClient } from "./utils/workspace-client.ts";

/**
 * Characterization spec: attaching a cluster
 * (COMP-01, COMP-04, COMP-06) had no e2e coverage. The bundle names no `cluster_id`. "Databricks:
 * Configure compute", then the shared cluster by name: the Cluster row's
 * description is its name, and the target's `vscode.overrides.json` holds
 * its `clusterId`.
 */
describe("Attach compute", async function () {
    let vscodeWorkspaceRoot: string;
    let clusterId: string;
    let clusterName: string;

    this.timeout(3 * 60 * 1000);

    before(async function () {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH env var doesn't exist");
        assert(
            process.env.TEST_DEFAULT_CLUSTER_ID,
            "TEST_DEFAULT_CLUSTER_ID env var doesn't exist",
        );
        vscodeWorkspaceRoot = process.env.WORKSPACE_PATH;
        clusterId = process.env.TEST_DEFAULT_CLUSTER_ID;
        const cluster = await new WorkspaceClient({ profile: "DEFAULT" }).clusters.get({
            clusterId,
        });
        assert(cluster.clusterName, `Cluster ${clusterId} has no name`);
        clusterName = cluster.clusterName;

        const config = getBasicBundleConfig({
            bundle: { name: getUniqueResourceName("compute_attach") },
        });
        // The fixture adds the shared cluster as `cluster_id`; this spec picks it instead.
        delete (config.bundle as Record<string, unknown>).cluster_id;
        await writeRootBundleConfig(config, vscodeWorkspaceRoot);
        await dismissNotifications();
    });

    it("should wait for extension activation", async () => {
        const section = await getViewSection("PROJECT");
        assert(section);
    });

    it("should wait for connection", async () => {
        await waitForLogin("DEFAULT");
        await dismissNotifications();
    });

    it("should start on serverless compute, the default when nothing is chosen", async () => {
        await browser.waitUntil(
            async () => (await getConfigurationItem("serverless")) !== undefined,
            {
                timeout: 60_000,
                interval: 1_000,
                timeoutMsg: 'The "Serverless" row never showed',
            },
        );
    });

    it("should attach the shared cluster through Configure compute", async () => {
        await executeCommandWhenAvailable("Databricks: Configure compute");
        // It waits until the picker isn't busy, so the clusters have loaded.
        const input = await waitForInput();
        await browser.waitUntil(
            async () => (await input.findQuickPick(clusterName)) !== undefined,
            {
                timeout: 30_000,
                timeoutMsg: `The picker never listed "${clusterName}"`,
            },
        );
        await input.selectQuickPick(clusterName);
    });

    it("should show the cluster's name on the Cluster row", async () => {
        let description: string | undefined;
        await browser.waitUntil(
            async () => {
                const item = await getConfigurationItem("cluster");
                description = await item?.getDescription();
                return description === clusterName;
            },
            {
                timeout: 60_000,
                interval: 1_000,
                timeoutMsg: `The Cluster row never showed "${clusterName}"; it shows "${description}"`,
            },
        );
    });

    it("should save the cluster in the target's overrides file", async () => {
        const file = path.join(
            vscodeWorkspaceRoot,
            ".databricks",
            "bundle",
            "dev_test",
            "vscode.overrides.json",
        );
        const overrides = JSON.parse(await fs.readFile(file, "utf-8")) as { clusterId?: string };
        assert.strictEqual(overrides.clusterId, clusterId);
    });
});
