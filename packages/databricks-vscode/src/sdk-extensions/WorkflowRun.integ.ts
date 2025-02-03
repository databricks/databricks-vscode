import assert from "assert";
import {jobs} from "@databricks/databricks-sdk";
import {IntegrationTestSetup} from "./test/IntegrationTestSetup";
import {WorkflowRun} from "./WorkflowRun";

describe(__filename, function () {
    let integSetup: IntegrationTestSetup;

    this.timeout(10 * 60 * 1000);

    before(async () => {
        integSetup = await IntegrationTestSetup.getInstance();
    });

    it("should run a python job", async () => {
        const dbfsApi = integSetup.client.dbfs;
        const jobPath = `/tmp/sdk-js-integ-${integSetup.testRunId}.py`;

        await dbfsApi.put({
            path: jobPath,
            contents: Buffer.from(
                "# Databricks notebook source\nprint('hello from job')"
            ).toString("base64"),
            overwrite: true,
        });

        try {
            const progress: Array<WorkflowRun> = [];
            const output = await WorkflowRun.runPythonAndWait({
                client: integSetup.client.apiClient,
                clusterId: integSetup.cluster.id,
                path: `dbfs:${jobPath}`,
                onProgress: (
                    _state: jobs.RunLifeCycleState,
                    run: WorkflowRun
                ) => {
                    progress.push(run);
                },
            });

            assert(progress.length >= 1);
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
        const jobPath = `/tmp/js-sdk-jobs-tests/sdk-js-integ-${integSetup.testRunId}.py`;
        await integSetup.client.workspace.mkdirs({
            path: "/tmp/js-sdk-jobs-tests",
        });

        await integSetup.client.workspace.import({
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
            const output = await WorkflowRun.runNotebookAndWait({
                client: integSetup.client.apiClient,
                clusterId: integSetup.cluster.id,
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
            await integSetup.client.workspace.delete({path: jobPath});
        }
    });

    it("should run a broken notebook job", async () => {
        const jobPath = `/tmp/js-sdk-jobs-tests/sdk-js-integ-${integSetup.testRunId}.py`;
        await integSetup.client.workspace.mkdirs({
            path: "/tmp/js-sdk-jobs-tests",
        });

        await integSetup.client.workspace.import({
            path: jobPath,
            format: "SOURCE",
            language: "PYTHON",
            content: Buffer.from(
                `# Databricks notebook source
# COMMAND ----------
            
pr int("Cell 1")
            
# COMMAND ----------

print("Cell 2")`
            ).toString("base64"),
            overwrite: true,
        });

        try {
            const progress: Array<WorkflowRun> = [];
            const output = await WorkflowRun.runNotebookAndWait({
                client: integSetup.client.apiClient,
                clusterId: integSetup.cluster.id,
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
                "INTERNAL_ERROR"
            );

            assert(
                output.views &&
                    output.views.length > 0 &&
                    output.views[0].content
            );
            assert(output.views[0].content.startsWith("<!DOCTYPE html>"));
        } finally {
            await integSetup.client.workspace.delete({path: jobPath});
        }
    });
});
