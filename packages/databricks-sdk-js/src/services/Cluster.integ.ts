/* eslint-disable @typescript-eslint/naming-convention */

import {CancellationToken, Cluster} from "..";
import assert from "node:assert";
import {IntegrationTestSetup} from "../test/IntegrationTestSetup";

describe(__filename, function () {
    let integSetup: IntegrationTestSetup;

    this.timeout(10 * 60 * 1000);

    before(async () => {
        integSetup = await IntegrationTestSetup.getInstance();
    });

    it("should create an execution context", async () => {
        assert(await integSetup.cluster.canExecute());

        const ctx = await integSetup.cluster.createExecutionContext();
        const {result} = await ctx.execute("print('hello')");

        assert(result.results);
        assert(result.results.resultType === "text");
        assert.equal(result.results.data, "hello");
    });

    it("should load a cluster by name", async () => {
        const clusterA = integSetup.cluster;

        const clusterB = await Cluster.fromClusterName(
            integSetup.client.apiClient,
            clusterA.details.cluster_name!
        );

        assert(clusterA.id);
        assert.equal(clusterA.id, clusterB?.id);
    });

    // skipping because running the test takes too long
    it.skip("should start a stopping cluster", async () => {
        let listener: any;
        const token: CancellationToken = {
            isCancellationRequested: false,
            onCancellationRequested: (_listener) => {
                listener = _listener;
            },
        };

        const cluster = integSetup.cluster;
        // stop cluster
        await Promise.race([
            cluster.stop(token, async (info) =>
                // eslint-disable-next-line no-console
                console.log(`Stopping - ${info.state}`)
            ),
            new Promise<void>((resolve) => {
                // cancel stop
                setTimeout(() => {
                    token.isCancellationRequested = true;
                    listener();
                    resolve();
                }, 500);
            }),
        ]);

        // start cluster
        await cluster.start(undefined, (state) =>
            // eslint-disable-next-line no-console
            console.log(`Starting ${state}`)
        );
    });
});
