/* eslint-disable @typescript-eslint/naming-convention */

import {
    ApiClient,
    ClustersApi,
    JobsService,
    DbfsService,
    ExecutionContextApi,
    CommandsApi,
    ExecutionContext,
} from ".";
import assert = require("assert");
import {v4 as uuidv4} from "uuid";
import {fromEnv} from "./auth/fromEnv";

describe("Integration tests for the Databricks SDK", function () {
    let client: ApiClient;
    let clusterId: string;
    let testRunId: string;
    let cleanupCluster = false;

    this.timeout(10 * 60 * 1000);

    before(async () => {
        testRunId = uuidv4();
        client = new ApiClient(fromEnv());
        let clustersApi = new ClustersApi(client);

        if (process.env["DATABRICKS_CLUSTER_ID"]) {
            clusterId = process.env["DATABRICKS_CLUSTER_ID"];
            clustersApi.start({cluster_id: clusterId});
        } else {
            cleanupCluster = true;

            let response = await clustersApi.create({
                cluster_name: `sdk-integ-test-${testRunId}`,
                spark_version: "10.4.x-scala2.12",
                num_workers: 0,
                node_type_id: "m5d.large",
                autotermination_minutes: 30,
            });

            clusterId = response.cluster_id;
        }

        // wait for cluster to be running
        while (true) {
            let cluster = await clustersApi.get({cluster_id: clusterId});
            if (cluster.state === "RUNNING") {
                break;
            }

            await new Promise((resolve) => {
                setTimeout(resolve, 1000);
            });
        }
    });

    after(async () => {
        if (!cleanupCluster) {
            return;
        }

        let clustersApi = new ClustersApi(client);

        await clustersApi.delete({
            cluster_id: clusterId,
        });
    });

    it("should run a notebook job", async () => {
        let jobsService = new JobsService(client);

        let dbfsApi = new DbfsService(client);
        let jobPath = `/tmp/sdk-js-integ-${testRunId}.py`;

        await dbfsApi.put({
            path: jobPath,
            contents: Buffer.from(
                "# Databricks notebook source\nprint('hello from job')"
            ).toString("base64"),
            overwrite: true,
        });

        let res = await jobsService.submit({
            tasks: [
                {
                    task_key: "hello_world",
                    existing_cluster_id: clusterId,
                    spark_python_task: {
                        python_file: `dbfs:${jobPath}`,
                    },
                },
            ],
        });

        // console.log(res);
        let runId = res.run_id;

        while (true) {
            await sleep(3000);
            let run = await jobsService.getRun({run_id: runId});
            let state = run.state.life_cycle_state;

            // console.log(`State: ${state} - URL: ${run.run_page_url}`);

            if (state === "INTERNAL_ERROR" || state === "TERMINATED") {
                let output = await jobsService.getRunOutput({
                    run_id: run.tasks[0].run_id,
                });
                // console.log(output);

                assert.equal(output.logs, "hello from job");
                break;
            }
        }

        dbfsApi.delete({path: jobPath});
    });

    it("should execute python with low level API", async () => {
        let executionContextApi = new ExecutionContextApi(client);
        let commandsApi = new CommandsApi(client);

        let context = await executionContextApi.create({
            clusterId,
            language: "python",
        });
        //console.log("Execution context", context);

        let command = await commandsApi.execute({
            clusterId,
            contextId: context.id,
            language: "python",
            command: "print('juhu')",
        });

        //console.log("Command", command);
        let status;
        while (true) {
            await sleep(3000);
            status = await commandsApi.status({
                clusterId,
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
            clusterId: "1118-013127-82wynr8t",
            contextId: context.id,
        });
    });

    it("should run python with high level API", async () => {
        let context = await ExecutionContext.create(client, clusterId);

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

function sleep(timeout: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, timeout);
    });
}
