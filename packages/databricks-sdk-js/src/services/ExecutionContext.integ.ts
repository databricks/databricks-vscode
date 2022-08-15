/* eslint-disable @typescript-eslint/naming-convention */

import {ExecutionContext} from "..";
import assert from "assert";

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
            integSetup.cluster
        );

        let statusUpdateCalled = false;
        var {cmd, result} = await context.execute(
            "print('juhu')",
            (e) => (statusUpdateCalled = true)
        );
        assert(statusUpdateCalled);
        assert(result.results);
        assert(result.results.resultType === "text");
        assert.equal(result.results.data, "juhu");

        statusUpdateCalled = false;
        ({cmd, result} = await context.execute("print('kinners')"));
        assert(!statusUpdateCalled);
        assert(result.results);
        assert(result.results.resultType === "text");
        assert.equal(result.results.data, "kinners");

        await context.destroy();
    });
});
