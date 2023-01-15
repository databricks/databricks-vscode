/* eslint-disable @typescript-eslint/naming-convention */

import {ExecutionContext} from "..";
import assert from "assert";

import {IntegrationTestSetup} from "../test/IntegrationTestSetup";
import {mock, when, instance} from "ts-mockito";
import {TokenFixture} from "../test/fixtures/TokenFixtures";

describe(__filename, function () {
    let integSetup: IntegrationTestSetup;

    this.timeout(10 * 60 * 1000);

    before(async () => {
        integSetup = await IntegrationTestSetup.getInstance();
    });

    it("should run python with high level API", async () => {
        const context = await ExecutionContext.create(
            integSetup.client.apiClient,
            integSetup.cluster
        );

        let statusUpdateCalled = false;
        let {cmd, result} = await context.execute(
            "print('juhu')",
            () => (statusUpdateCalled = true)
        );
        assert(cmd);
        assert(statusUpdateCalled);
        assert(result.results);
        assert(result.results.resultType === "text");
        assert.equal(result.results.data, "juhu");

        statusUpdateCalled = false;
        ({cmd, result} = await context.execute("print('kinners')"));
        assert(cmd);
        assert(!statusUpdateCalled);
        assert(result.results);
        assert(result.results.resultType === "text");
        assert.equal(result.results.data, "kinners");

        await context.destroy();
    });

    it("should cancel running command", async () => {
        const context = await ExecutionContext.create(
            integSetup.client.apiClient,
            integSetup.cluster
        );

        const token = mock(TokenFixture);
        when(token.isCancellationRequested).thenReturn(false, false, true);

        const {cmd, result} = await context.execute(
            "while True: pass",
            undefined,
            instance(token)
        );
        // The API surfaces an exception when a command is cancelled
        // The cancellation itself proceeds as expected, but the status
        // is FINISHED instead of CANCELLED
        assert(cmd);
        assert.equal(result.status, "Finished");
        assert(result.results?.resultType === "error");
        assert(result.results!.cause!.includes("CommandCancelledException"));
    });
});
