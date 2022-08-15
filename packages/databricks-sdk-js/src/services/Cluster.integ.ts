/* eslint-disable @typescript-eslint/naming-convention */

import {Cluster, ClusterService} from "..";
import assert from "assert";

import {IntegrationTestSetup} from "../test/IntegrationTestSetup";

describe(__filename, function () {
    let integSetup: IntegrationTestSetup;

    this.timeout(10 * 60 * 1000);

    before(async () => {
        integSetup = await IntegrationTestSetup.getInstance();
    });

    it("should create an execution context", async () => {
        await integSetup.cluster.canExecute();

        let ctx = await integSetup.cluster.createExecutionContext();
        let {result} = await ctx.execute("print('hello')");

        assert(result.results);
        assert(result.results.resultType === "text");
        assert.equal(result.results.data, "hello");
    });

    it("should load a cluster by name", async () => {
        let clusterA = integSetup.cluster;

        let clusterB = await Cluster.fromClusterName(
            integSetup.client,
            clusterA.details.cluster_name!
        );

        assert(clusterA.id);
        assert.equal(clusterA.id, clusterB?.id);
    });

    // TODO: run tests changing the state of cluster in a seperate job, on a single node
    it.skip("calling start on a non terminated state should not throw an error", async () => {
        await integSetup.cluster.stop();
        await new ClusterService(integSetup.client).start({
            cluster_id: integSetup.cluster.id,
        });

        await integSetup.cluster.refresh();
        assert(integSetup.cluster.state !== "RUNNING");

        await integSetup.cluster.start();
    });

    it.skip("should terminate cluster", async () => {
        integSetup.cluster.start();
        assert.equal(integSetup.cluster.state, "RUNNING");

        await integSetup.cluster.stop();
        assert.equal(integSetup.cluster.state, "TERMINATED");

        integSetup.cluster.start();
    });

    it.skip("should terminate non running clusters", async () => {
        await integSetup.cluster.stop();
        assert.equal(integSetup.cluster.state, "TERMINATED");

        await new ClusterService(integSetup.client).start({
            cluster_id: integSetup.cluster.id,
        });
        await integSetup.cluster.refresh();
        assert.notEqual(integSetup.cluster.state, "RUNNING");

        await integSetup.cluster.stop();
        assert.equal(integSetup.cluster.state, "TERMINATED");

        await integSetup.cluster.start();
        assert.equal(integSetup.cluster.state, "RUNNING");
    });
});
