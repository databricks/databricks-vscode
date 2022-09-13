/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

import {ApiClient} from "../../api-client";
import * as model from "./model";
import Time from "../../retries/Time";
import retry, {RetriableError} from "../../retries/retries";
export class JobsRetriableError extends RetriableError {}
export class JobsError extends Error {}

/**
 * The Jobs API allows you to create, edit, and delete jobs.
 */
export class JobsService {
    constructor(readonly client: ApiClient) {}
    /**
     * Cancels all active runs of a job. The runs are canceled asynchronously, so
     * it doesn't prevent new runs from being started.
     */
    async cancelAllRuns(
        request: model.CancelAllRuns
    ): Promise<model.CancelAllRunsResponse> {
        const path = "/api/2.1/jobs/runs/cancel-all";
        return (await this.client.request(
            path,
            "POST",
            request
        )) as model.CancelAllRunsResponse;
    }

    /**
     * Cancels a job run. The run is canceled asynchronously, so it may still be
     * running when this request completes.
     */
    async cancelRun(
        request: model.CancelRun
    ): Promise<model.CancelRunResponse> {
        const path = "/api/2.1/jobs/runs/cancel";
        return (await this.client.request(
            path,
            "POST",
            request
        )) as model.CancelRunResponse;
    }

    /**
     * cancelRun and wait to reach TERMINATED or SKIPPED state
     *  or fail on reaching INTERNAL_ERROR state
     */
    async cancelRunAndWait(
        request: model.CancelRun,
        timeout?: Time
    ): Promise<model.Run> {
        const response = await this.cancelRun(request);

        return await retry<model.Run>({
            timeout: timeout,
            fn: async () => {
                const pollResponse = await this.getRun({
                    run_id: request.run_id!,
                });
                const status = pollResponse.state!.life_cycle_state;
                const statusMessage = pollResponse.state!.state_message;
                switch (status) {
                    case "TERMINATED":
                    case "SKIPPED": {
                        return pollResponse;
                    }
                    case "INTERNAL_ERROR": {
                        throw new JobsError(
                            `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new JobsRetriableError(
                            `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    /**
     * Create a new job.
     */
    async create(request: model.CreateJob): Promise<model.CreateResponse> {
        const path = "/api/2.1/jobs/create";
        return (await this.client.request(
            path,
            "POST",
            request
        )) as model.CreateResponse;
    }

    /**
     * Deletes a job.
     */
    async delete(request: model.DeleteJob): Promise<model.DeleteResponse> {
        const path = "/api/2.1/jobs/delete";
        return (await this.client.request(
            path,
            "POST",
            request
        )) as model.DeleteResponse;
    }

    /**
     * Deletes a non-active run. Returns an error if the run is active.
     */
    async deleteRun(
        request: model.DeleteRun
    ): Promise<model.DeleteRunResponse> {
        const path = "/api/2.1/jobs/runs/delete";
        return (await this.client.request(
            path,
            "POST",
            request
        )) as model.DeleteRunResponse;
    }

    /**
     * Export and retrieve the job run task.
     */
    async exportRun(
        request: model.ExportRunRequest
    ): Promise<model.ExportRunOutput> {
        const path = "/api/2.1/jobs/runs/export";
        return (await this.client.request(
            path,
            "GET",
            request
        )) as model.ExportRunOutput;
    }

    /**
     * Retrieves the details for a single job.
     */
    async get(request: model.GetRequest): Promise<model.Job> {
        const path = "/api/2.1/jobs/get";
        return (await this.client.request(path, "GET", request)) as model.Job;
    }

    /**
     * Retrieve the metadata of a run.
     */
    async getRun(request: model.GetRunRequest): Promise<model.Run> {
        const path = "/api/2.1/jobs/runs/get";
        return (await this.client.request(path, "GET", request)) as model.Run;
    }

    /**
     * getRun and wait to reach TERMINATED or SKIPPED state
     *  or fail on reaching INTERNAL_ERROR state
     */
    async getRunAndWait(
        request: model.GetRunRequest,
        timeout?: Time
    ): Promise<model.Run> {
        const response = await this.getRun(request);

        return await retry<model.Run>({
            timeout: timeout,
            fn: async () => {
                const pollResponse = await this.getRun({
                    run_id: response.run_id!,
                });
                const status = pollResponse.state!.life_cycle_state;
                const statusMessage = pollResponse.state!.state_message;
                switch (status) {
                    case "TERMINATED":
                    case "SKIPPED": {
                        return pollResponse;
                    }
                    case "INTERNAL_ERROR": {
                        throw new JobsError(
                            `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new JobsRetriableError(
                            `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    /**
     * Retrieve the output and metadata of a single task run. When a notebook
     * task returns a value through the dbutils.notebook.exit() call, you can use
     * this endpoint to retrieve that value. jobs restricts this API to return
     * the first 5 MB of the output. To return a larger result, you can store job
     * results in a cloud storage service. This endpoint validates that the
     * run_id parameter is valid and returns an HTTP status code 400 if the
     * run_id parameter is invalid. Runs are automatically removed after 60 days.
     * If you to want to reference them beyond 60 days, you must save old run
     * results before they expire. To export using the UI, see Export job run
     * results. To export using the Jobs API, see Runs export.
     */
    async getRunOutput(
        request: model.GetRunOutputRequest
    ): Promise<model.RunOutput> {
        const path = "/api/2.1/jobs/runs/get-output";
        return (await this.client.request(
            path,
            "GET",
            request
        )) as model.RunOutput;
    }

    /**
     * Retrieves a list of jobs.
     */
    async list(request: model.ListRequest): Promise<model.ListResponse> {
        const path = "/api/2.1/jobs/list";
        return (await this.client.request(
            path,
            "GET",
            request
        )) as model.ListResponse;
    }

    /**
     * List runs in descending order by start time.
     */
    async listRuns(
        request: model.ListRunsRequest
    ): Promise<model.ListRunsResponse> {
        const path = "/api/2.1/jobs/runs/list";
        return (await this.client.request(
            path,
            "GET",
            request
        )) as model.ListRunsResponse;
    }

    /**
     * Re-run one or more tasks. Tasks are re-run as part of the original job
     * run, use the current job and task settings, and can be viewed in the
     * history for the original job run.
     */
    async repairRun(
        request: model.RepairRun
    ): Promise<model.RepairRunResponse> {
        const path = "/api/2.1/jobs/runs/repair";
        return (await this.client.request(
            path,
            "POST",
            request
        )) as model.RepairRunResponse;
    }

    /**
     * repairRun and wait to reach TERMINATED or SKIPPED state
     *  or fail on reaching INTERNAL_ERROR state
     */
    async repairRunAndWait(
        request: model.RepairRun,
        timeout?: Time
    ): Promise<model.Run> {
        const response = await this.repairRun(request);

        return await retry<model.Run>({
            timeout: timeout,
            fn: async () => {
                const pollResponse = await this.getRun({
                    run_id: request.run_id!,
                });
                const status = pollResponse.state!.life_cycle_state;
                const statusMessage = pollResponse.state!.state_message;
                switch (status) {
                    case "TERMINATED":
                    case "SKIPPED": {
                        return pollResponse;
                    }
                    case "INTERNAL_ERROR": {
                        throw new JobsError(
                            `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new JobsRetriableError(
                            `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    /**
     * Overwrites all the settings for a specific job. Use the Update endpoint to
     * update job settings partially.
     */
    async reset(request: model.ResetJob): Promise<model.ResetResponse> {
        const path = "/api/2.1/jobs/reset";
        return (await this.client.request(
            path,
            "POST",
            request
        )) as model.ResetResponse;
    }

    /**
     * Run a job and return the `run_id` of the triggered run.
     */
    async runNow(request: model.RunNow): Promise<model.RunNowResponse> {
        const path = "/api/2.1/jobs/run-now";
        return (await this.client.request(
            path,
            "POST",
            request
        )) as model.RunNowResponse;
    }

    /**
     * runNow and wait to reach TERMINATED or SKIPPED state
     *  or fail on reaching INTERNAL_ERROR state
     */
    async runNowAndWait(
        request: model.RunNow,
        timeout?: Time
    ): Promise<model.Run> {
        const response = await this.runNow(request);

        return await retry<model.Run>({
            timeout: timeout,
            fn: async () => {
                const pollResponse = await this.getRun({
                    run_id: response.run_id!,
                });
                const status = pollResponse.state!.life_cycle_state;
                const statusMessage = pollResponse.state!.state_message;
                switch (status) {
                    case "TERMINATED":
                    case "SKIPPED": {
                        return pollResponse;
                    }
                    case "INTERNAL_ERROR": {
                        throw new JobsError(
                            `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new JobsRetriableError(
                            `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    /**
     * Submit a one-time run. This endpoint allows you to submit a workload
     * directly without creating a job. Runs submitted using this endpoint don?t
     * display in the UI. Use the `jobs/runs/get` API to check the run state
     * after the job is submitted.
     */
    async submit(request: model.SubmitRun): Promise<model.SubmitRunResponse> {
        const path = "/api/2.1/jobs/runs/submit";
        return (await this.client.request(
            path,
            "POST",
            request
        )) as model.SubmitRunResponse;
    }

    /**
     * submit and wait to reach TERMINATED or SKIPPED state
     *  or fail on reaching INTERNAL_ERROR state
     */
    async submitAndWait(
        request: model.SubmitRun,
        timeout?: Time
    ): Promise<model.Run> {
        const response = await this.submit(request);

        return await retry<model.Run>({
            timeout: timeout,
            fn: async () => {
                const pollResponse = await this.getRun({
                    run_id: response.run_id!,
                });
                const status = pollResponse.state!.life_cycle_state;
                const statusMessage = pollResponse.state!.state_message;
                switch (status) {
                    case "TERMINATED":
                    case "SKIPPED": {
                        return pollResponse;
                    }
                    case "INTERNAL_ERROR": {
                        throw new JobsError(
                            `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new JobsRetriableError(
                            `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    /**
     * Add, update, or remove specific settings of an existing job. Use the
     * ResetJob to overwrite all job settings.
     */
    async update(request: model.UpdateJob): Promise<model.UpdateResponse> {
        const path = "/api/2.1/jobs/update";
        return (await this.client.request(
            path,
            "POST",
            request
        )) as model.UpdateResponse;
    }
}
