/* eslint-disable @typescript-eslint/naming-convention */

import {JobsService, DbfsService} from "..";
import assert = require("assert");

import {IntegrationTestSetup, sleep} from "../test/IntegrationTestSetup";

describe(__filename, function () {
    let integSetup: IntegrationTestSetup;

    this.timeout(10 * 60 * 1000);

    before(async () => {
        integSetup = await IntegrationTestSetup.getInstance();
    });

    it("should run a notebook job", async () => {
        let jobsService = new JobsService(integSetup.client);

        let dbfsApi = new DbfsService(integSetup.client);
        let jobPath = `/tmp/sdk-js-integ-${integSetup.testRunId}.py`;

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
                    existing_cluster_id: integSetup.clusterId,
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

                assert.equal(output.logs.trim(), "hello from job");
                break;
            }
        }

        dbfsApi.delete({path: jobPath});
    });
});
