/* eslint-disable @typescript-eslint/naming-convention */

import {Cluster} from "..";
import assert from "assert";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {IntegrationTestSetup} from "../test/IntegrationTestSetup";

chai.use(chaiAsPromised);

describe(__filename, function () {
    let integSetup: IntegrationTestSetup;

    this.timeout(10 * 60 * 1000);

    before(async () => {
        integSetup = await IntegrationTestSetup.getInstance();
    });

    it("should create an execution context", async () => {
        assert(await integSetup.cluster.canExecute());

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
});
