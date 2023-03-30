/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";

import {IntegrationTestSetup, sleep} from "../../test/IntegrationTestSetup";

describe(__filename, function () {
    let integSetup: IntegrationTestSetup;

    this.timeout(10 * 60 * 1000);

    before(async () => {
        integSetup = await IntegrationTestSetup.getInstance();
    });

    it("should execute python with low level API", async () => {
        const commandsApi = integSetup.client.commands;

        const context = await (
            await commandsApi.create({
                clusterId: integSetup.cluster.id,
                language: "python",
            })
        ).wait();
        //console.log("Execution context", context);

        const status = await (
            await commandsApi.execute({
                clusterId: integSetup.cluster.id,
                contextId: context.id,
                language: "python",
                command: "print('juhu')",
            })
        ).wait();

        // console.log("Status", status);

        assert(status.results);
        assert(status.results.resultType === "text");
        assert.equal(status.results.data, "juhu");

        await commandsApi.destroy({
            clusterId: integSetup.cluster.id,
            contextId: context.id!,
        });
    });
});
