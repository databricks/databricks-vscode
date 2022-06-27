/* eslint-disable @typescript-eslint/naming-convention */

import {Cluster} from "..";
import assert = require("assert");

import {IntegrationTestSetup} from "../test/IntegrationTestSetup";
import cluster from "cluster";

describe(__filename, function () {
    let integSetup: IntegrationTestSetup;

    this.timeout(10 * 60 * 1000);

    before(async () => {
        integSetup = await IntegrationTestSetup.getInstance();
    });

    it("should create an execution context", async () => {
        let cluster = await Cluster.fromClusterId(
            integSetup.client,
            integSetup.clusterId
        );

        await cluster.canExecute();

        let ctx = await cluster.createExecutioncontext();
        let command = await ctx.execute("print('hello')");
        let result = await command.response();

        assert(result.results);
        assert(result.results.resultType === "text");
        assert.equal(result.results.data, "hello");
    });

    it("should load a cluster by name", async () => {
        let clusterA = await Cluster.fromClusterId(
            integSetup.client,
            integSetup.clusterId
        );

        let clusterB = await Cluster.fromClusterName(
            integSetup.client,
            clusterA.details.cluster_name
        );

        assert(clusterA.details.cluster_id);
        assert.equal(clusterA.details.cluster_id, clusterB?.details.cluster_id);
    });
});
