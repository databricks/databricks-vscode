/* eslint-disable @typescript-eslint/naming-convention */
import {WorkspaceClient} from "./WorkspaceClient";
import * as assert from "assert";

/**
 * This test is skipped because it only works in workspaces that have a sufficient amount of resources
 * to paginate through.
 */
describe.skip(__filename, function () {
    this.timeout(10_000);

    let wsClient: WorkspaceClient;

    beforeEach(() => {
        wsClient = new WorkspaceClient({});
    });

    // repos list
    it("should paginate by token", async () => {
        const items = [];
        for await (const repo of wsClient.repos.list({})) {
            items.push(repo);
            if (items.length > 50) {
                break;
            }
        }

        assert.ok(items.length > 0);
    });

    // jobs list
    it("should paginate by token and dedupe results", async () => {
        const items = [];
        const seen = new Set<number>();
        for await (const job of wsClient.jobs.list({})) {
            items.push(job);
            assert.ok(job.job_id);
            if (seen.has(job.job_id!)) {
                assert.fail(`job_id ${job.job_id} already seen`);
            } else {
                seen.add(job.job_id!);
            }
            if (items.length > 50) {
                break;
            }
        }

        assert.ok(items.length > 0);
    });

    // jobs list
    it("should paginate by offset", async () => {
        const items = [];
        for await (const job of wsClient.jobs.list({
            limit: 25,
        })) {
            if (items.length > 50) {
                break;
            }
            items.push(job);
        }

        assert.ok(items.length > 0);
    });

    // sql dashboards list
    it("should paginate with offset 1", async () => {
        const items = [];
        for await (const dashboard of wsClient.dashboards.list({})) {
            if (items.length > 40) {
                break;
            }
            items.push(dashboard);
        }

        assert.ok(items.length > 0);
    });

    it("should paginate cluster events", async () => {
        const items = [];
        for await (const item of wsClient.clusters.events({
            cluster_id: process.env.DATABRICKS_CLUSTER_ID!,
        })) {
            items.push(item);
            if (items.length > 50) {
                break;
            }
        }

        assert.ok(items.length > 0);
    });

    it("should return the body for calls that don't paginate", async () => {
        // this case doesn't seem to exist
    });

    // cluster policies
    it("should return items for calls that don't paginate", async () => {
        const items = [];
        for await (const item of wsClient.clusterPolicies.list({})) {
            items.push(item);
        }

        assert.ok(items.length > 0);
    });
});
