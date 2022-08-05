import {DbfsService, Cluster, jobs, WorkflowRun, WorkspaceService} from "..";
import assert from "assert";

import {IntegrationTestSetup} from "../test/IntegrationTestSetup";

describe(__filename, function () {
    let integSetup: IntegrationTestSetup;

    this.timeout(10 * 60 * 1000);

    before(async () => {
        integSetup = await IntegrationTestSetup.getInstance();
    });

    it("should run a python job", async () => {
        let cluster = await Cluster.fromClusterId(
            integSetup.client,
            integSetup.cluster.id
        );

        let dbfsApi = new DbfsService(integSetup.client);
        let jobPath = `/tmp/sdk-js-integ-${integSetup.testRunId}.py`;

        await dbfsApi.put({
            path: jobPath,
            contents: Buffer.from(
                "# Databricks notebook source\nprint('hello from job')"
            ).toString("base64"),
            overwrite: true,
        });

        try {
            const progress: Array<WorkflowRun> = [];
            let output = await cluster.runPythonAndWait({
                path: `dbfs:${jobPath}`,
                onProgress: (
                    _state: jobs.RunLifeCycleState,
                    run: WorkflowRun
                ) => {
                    progress.push(run);
                },
            });

            assert(progress.length > 1);
            assert.equal(
                progress[progress.length - 1].lifeCycleState,
                "TERMINATED"
            );
            assert.equal(output.logs?.trim(), "hello from job");
        } finally {
            await dbfsApi.delete({path: jobPath});
        }
    });

    it("should run a notebook job", async () => {
        let cluster = await Cluster.fromClusterId(
            integSetup.client,
            integSetup.cluster.id
        );

        let jobPath = `/tmp/sdk-js-integ-${integSetup.testRunId}.py`;
        let workspaceService = new WorkspaceService(integSetup.client);
        await workspaceService.import({
            path: jobPath,
            format: "SOURCE",
            language: "PYTHON",
            content: Buffer.from(
                "# Databricks notebook source\nprint('hello from job')"
            ).toString("base64"),
            overwrite: true,
        });

        try {
            const progress: Array<WorkflowRun> = [];
            let output = await cluster.runNotebookAndWait({
                path: `${jobPath}`,
                onProgress: (
                    _state: jobs.RunLifeCycleState,
                    run: WorkflowRun
                ) => {
                    progress.push(run);
                },
            });

            assert(progress.length > 1);
            assert.equal(
                progress[progress.length - 1].lifeCycleState,
                "TERMINATED"
            );

            assert(
                output.views &&
                    output.views.length > 0 &&
                    output.views[0].content
            );
            assert(output.views[0].content.startsWith("<!DOCTYPE html>"));
        } finally {
            await workspaceService.delete({path: jobPath});
        }
    });
});
