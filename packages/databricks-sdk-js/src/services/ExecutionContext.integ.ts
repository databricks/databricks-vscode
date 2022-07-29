/* eslint-disable @typescript-eslint/naming-convention */

import {ExecutionContext} from "..";
import * as assert from "assert";

import {IntegrationTestSetup} from "../test/IntegrationTestSetup";

describe(__filename, function () {
    let integSetup: IntegrationTestSetup;

    this.timeout(10 * 60 * 1000);

    before(async () => {
        integSetup = await IntegrationTestSetup.getInstance();
    });

    it("should run python with high level API", async () => {
        let context = await ExecutionContext.create(
            integSetup.client,
            integSetup.clusterId
        );

        var command = await context.execute("print('juhu')");

        let statusUpdateCalled = false;
        command.on("statusUpdate", (e) => (statusUpdateCalled = true));

        var result = await command.response();
        // console.log(result);

        command = await context.execute("print('kinners')");
        result = await command.response();
        // console.log(result);

        assert(statusUpdateCalled);
        assert(result.results);
        assert(result.results.resultType === "text");
        assert.equal(result.results.data, "kinners");

        await context.destroy();
    });
});
