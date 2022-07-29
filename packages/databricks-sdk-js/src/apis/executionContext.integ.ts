/* eslint-disable @typescript-eslint/naming-convention */

import {ExecutionContextApi, CommandsApi} from "..";
import assert = require("assert");

import {IntegrationTestSetup, sleep} from "../test/IntegrationTestSetup";

describe(__filename, function () {
    let integSetup: IntegrationTestSetup;

    this.timeout(10 * 60 * 1000);

    before(async () => {
        integSetup = await IntegrationTestSetup.getInstance();
    });

    it("should execute python with low level API", async () => {
        let executionContextApi = new ExecutionContextApi(integSetup.client);
        let commandsApi = new CommandsApi(integSetup.client);

        let context = await executionContextApi.create({
            clusterId: integSetup.clusterId,
            language: "python",
        });
        //console.log("Execution context", context);

        let command = await commandsApi.execute({
            clusterId: integSetup.clusterId,
            contextId: context.id,
            language: "python",
            command: "print('juhu')",
        });

        //console.log("Command", command);
        let status;
        while (true) {
            await sleep(3000);
            status = await commandsApi.status({
                clusterId: integSetup.clusterId,
                contextId: context.id,
                commandId: command.id,
            });

            if (status.status === "Finished") {
                break;
            }
        }

        // console.log("Status", status);

        assert(status.results);
        assert(status.results.resultType === "text");
        assert.equal(status.results.data, "juhu");

        await executionContextApi.destroy({
            clusterId: integSetup.clusterId,
            contextId: context.id,
        });
    });
});
