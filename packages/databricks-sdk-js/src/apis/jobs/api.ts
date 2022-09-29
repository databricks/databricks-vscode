/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

import {ApiClient} from "../../api-client";
import * as model from "./model";
import Time from "../../retries/Time";
import retry from "../../retries/retries";
import {CancellationToken} from "../../types";
import {ApiError, ApiRetriableError} from "../apiError";

export class JobsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Jobs", method, message);
    }
}
export class JobsError extends ApiError {
    constructor(method: string, message?: string) {
        super("Jobs", method, message);
    }
}

/**
 * The Jobs API allows you to create, edit, and delete jobs.
 */
export class JobsService {
    constructor(readonly client: ApiClient) {}
    /**
     * Cancel all runs of a job
     *
     * Cancels all active runs of a job. The runs are canceled asynchronously, so
     * it doesn't prevent new runs from being started.
     */
    async cancelAllRuns(
        request: model.CancelAllRuns,
        cancellationToken?: CancellationToken
    ): Promise<model.CancelAllRunsResponse> {
        const path = "/api/2.1/jobs/runs/cancel-all";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.CancelAllRunsResponse;
    }

    /**
     * Cancel a job run
     *
     * Cancels a job run. The run is canceled asynchronously, so it may still be
     * running when this request completes.
     */
    async cancelRun(
        request: model.CancelRun,
        cancellationToken?: CancellationToken
    ): Promise<model.CancelRunResponse> {
        const path = "/api/2.1/jobs/runs/cancel";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.CancelRunResponse;
    }

    /**
     * cancelRun and wait to reach TERMINATED or SKIPPED state
     *  or fail on reaching INTERNAL_ERROR state
     */
    async cancelRunAndWait({
        request,
        timeout,
        cancellationToken,
        onProgress = async (newPollResponse) => {},
    }: {
        request: model.CancelRun;
        timeout?: Time;
        cancellationToken?: CancellationToken;
        onProgress?: (newPollResponse: model.Run) => Promise<void>;
    }): Promise<model.Run> {
        const response = await this.cancelRun(request);

        return await retry<model.Run>({
            timeout: timeout,
            fn: async () => {
                const pollResponse = await this.getRun(
                    {
                        run_id: request.run_id!,
                    },
                    cancellationToken
                );
                if (cancellationToken?.isCancellationRequested) {
                    throw new JobsError("cancelRunAndWait", "cancelled");
                }
                await onProgress(pollResponse);
                const status = pollResponse.state!.life_cycle_state;
                const statusMessage = pollResponse.state!.state_message;
                switch (status) {
                    case "TERMINATED":
                    case "SKIPPED": {
                        return pollResponse;
                    }
                    case "INTERNAL_ERROR": {
                        throw new JobsError(
                            "cancelRunAndWait",
                            `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new JobsRetriableError(
                            "cancelRunAndWait",
                            `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    /**
     * Create a new job
     *
     * Create a new job.
     */
    async create(
        request: model.CreateJob,
        cancellationToken?: CancellationToken
    ): Promise<model.CreateResponse> {
        const path = "/api/2.1/jobs/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.CreateResponse;
    }

    /**
     * Delete a job
     *
     * Deletes a job.
     */
    async delete(
        request: model.DeleteJob,
        cancellationToken?: CancellationToken
    ): Promise<model.DeleteResponse> {
        const path = "/api/2.1/jobs/delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.DeleteResponse;
    }

    /**
     * Delete a job run
     *
     * Deletes a non-active run. Returns an error if the run is active.
     */
    async deleteRun(
        request: model.DeleteRun,
        cancellationToken?: CancellationToken
    ): Promise<model.DeleteRunResponse> {
        const path = "/api/2.1/jobs/runs/delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.DeleteRunResponse;
    }

    /**
     * Export and retrieve a job run
     *
     * Export and retrieve the job run task.
     */
    async exportRun(
        request: model.ExportRunRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.ExportRunOutput> {
        const path = "/api/2.1/jobs/runs/export";
        return (await this.client.request(
            path,
            "GET",
            request,
            cancellationToken
        )) as model.ExportRunOutput;
    }

    /**
     * Get a single job
     *
     * Retrieves the details for a single job.
     */
    async get(
        request: model.GetRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.Job> {
        const path = "/api/2.1/jobs/get";
        return (await this.client.request(
            path,
            "GET",
            request,
            cancellationToken
        )) as model.Job;
    }

    /**
     * Get a single job run
     *
     * Retrieve the metadata of a run.
     */
    async getRun(
        request: model.GetRunRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.Run> {
        const path = "/api/2.1/jobs/runs/get";
        return (await this.client.request(
            path,
            "GET",
            request,
            cancellationToken
        )) as model.Run;
    }

    /**
     * getRun and wait to reach TERMINATED or SKIPPED state
     *  or fail on reaching INTERNAL_ERROR state
     */
    async getRunAndWait({
        request,
        timeout,
        cancellationToken,
        onProgress = async (newPollResponse) => {},
    }: {
        request: model.GetRunRequest;
        timeout?: Time;
        cancellationToken?: CancellationToken;
        onProgress?: (newPollResponse: model.Run) => Promise<void>;
    }): Promise<model.Run> {
        const response = await this.getRun(request);

        return await retry<model.Run>({
            timeout: timeout,
            fn: async () => {
                const pollResponse = await this.getRun(
                    {
                        run_id: response.run_id!,
                    },
                    cancellationToken
                );
                if (cancellationToken?.isCancellationRequested) {
                    throw new JobsError("getRunAndWait", "cancelled");
                }
                await onProgress(pollResponse);
                const status = pollResponse.state!.life_cycle_state;
                const statusMessage = pollResponse.state!.state_message;
                switch (status) {
                    case "TERMINATED":
                    case "SKIPPED": {
                        return pollResponse;
                    }
                    case "INTERNAL_ERROR": {
                        throw new JobsError(
                            "getRunAndWait",
                            `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new JobsRetriableError(
                            "getRunAndWait",
                            `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    /**
     * Get the output for a single run
     *
     * Retrieve the output and metadata of a single task run. When a notebook
     * task returns a value through the `dbutils.notebook.exit()` call, you can
     * use this endpoint to retrieve that value. " + serviceName + " restricts
     * this API to returning the first 5 MB of the output. To return a larger
     * result, you can store job results in a cloud storage service.
     *
     * This endpoint validates that the __run_id__ parameter is valid and returns
     * an HTTP status code 400 if the __run_id__ parameter is invalid. Runs are
     * automatically removed after 60 days. If you to want to reference them
     * beyond 60 days, you must save old run results before they expire.
     */
    async getRunOutput(
        request: model.GetRunOutputRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.RunOutput> {
        const path = "/api/2.1/jobs/runs/get-output";
        return (await this.client.request(
            path,
            "GET",
            request,
            cancellationToken
        )) as model.RunOutput;
    }

    /**
     * List all jobs
     *
     * Retrieves a list of jobs.
     */
    async list(
        request: model.ListRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.ListResponse> {
        const path = "/api/2.1/jobs/list";
        return (await this.client.request(
            path,
            "GET",
            request,
            cancellationToken
        )) as model.ListResponse;
    }

    /**
     * List runs for a job
     *
     * List runs in descending order by start time.
     */
    async listRuns(
        request: model.ListRunsRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.ListRunsResponse> {
        const path = "/api/2.1/jobs/runs/list";
        return (await this.client.request(
            path,
            "GET",
            request,
            cancellationToken
        )) as model.ListRunsResponse;
    }

    /**
     * Repair a job run
     *
     * Re-run one or more tasks. Tasks are re-run as part of the original job
     * run. They use the current job and task settings, and can be viewed in the
     * history for the original job run.
     */
    async repairRun(
        request: model.RepairRun,
        cancellationToken?: CancellationToken
    ): Promise<model.RepairRunResponse> {
        const path = "/api/2.1/jobs/runs/repair";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.RepairRunResponse;
    }

    /**
     * repairRun and wait to reach TERMINATED or SKIPPED state
     *  or fail on reaching INTERNAL_ERROR state
     */
    async repairRunAndWait({
        request,
        timeout,
        cancellationToken,
        onProgress = async (newPollResponse) => {},
    }: {
        request: model.RepairRun;
        timeout?: Time;
        cancellationToken?: CancellationToken;
        onProgress?: (newPollResponse: model.Run) => Promise<void>;
    }): Promise<model.Run> {
        const response = await this.repairRun(request);

        return await retry<model.Run>({
            timeout: timeout,
            fn: async () => {
                const pollResponse = await this.getRun(
                    {
                        run_id: request.run_id!,
                    },
                    cancellationToken
                );
                if (cancellationToken?.isCancellationRequested) {
                    throw new JobsError("repairRunAndWait", "cancelled");
                }
                await onProgress(pollResponse);
                const status = pollResponse.state!.life_cycle_state;
                const statusMessage = pollResponse.state!.state_message;
                switch (status) {
                    case "TERMINATED":
                    case "SKIPPED": {
                        return pollResponse;
                    }
                    case "INTERNAL_ERROR": {
                        throw new JobsError(
                            "repairRunAndWait",
                            `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new JobsRetriableError(
                            "repairRunAndWait",
                            `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    /**
     * Overwrites all settings for a job
     *
     * Overwrites all the settings for a specific job. Use the Update endpoint to
     * update job settings partially.
     */
    async reset(
        request: model.ResetJob,
        cancellationToken?: CancellationToken
    ): Promise<model.ResetResponse> {
        const path = "/api/2.1/jobs/reset";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.ResetResponse;
    }

    /**
     * Trigger a new job run
     *
     * Run a job and return the `run_id` of the triggered run.
     */
    async runNow(
        request: model.RunNow,
        cancellationToken?: CancellationToken
    ): Promise<model.RunNowResponse> {
        const path = "/api/2.1/jobs/run-now";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.RunNowResponse;
    }

    /**
     * runNow and wait to reach TERMINATED or SKIPPED state
     *  or fail on reaching INTERNAL_ERROR state
     */
    async runNowAndWait({
        request,
        timeout,
        cancellationToken,
        onProgress = async (newPollResponse) => {},
    }: {
        request: model.RunNow;
        timeout?: Time;
        cancellationToken?: CancellationToken;
        onProgress?: (newPollResponse: model.Run) => Promise<void>;
    }): Promise<model.Run> {
        const response = await this.runNow(request);

        return await retry<model.Run>({
            timeout: timeout,
            fn: async () => {
                const pollResponse = await this.getRun(
                    {
                        run_id: response.run_id!,
                    },
                    cancellationToken
                );
                if (cancellationToken?.isCancellationRequested) {
                    throw new JobsError("runNowAndWait", "cancelled");
                }
                await onProgress(pollResponse);
                const status = pollResponse.state!.life_cycle_state;
                const statusMessage = pollResponse.state!.state_message;
                switch (status) {
                    case "TERMINATED":
                    case "SKIPPED": {
                        return pollResponse;
                    }
                    case "INTERNAL_ERROR": {
                        throw new JobsError(
                            "runNowAndWait",
                            `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new JobsRetriableError(
                            "runNowAndWait",
                            `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    /**
     * Create and trigger a one-time run
     *
     * Submit a one-time run. This endpoint allows you to submit a workload
     * directly without creating a job. Runs submitted using this endpoint don?t
     * display in the UI. Use the `jobs/runs/get` API to check the run state
     * after the job is submitted.
     */
    async submit(
        request: model.SubmitRun,
        cancellationToken?: CancellationToken
    ): Promise<model.SubmitRunResponse> {
        const path = "/api/2.1/jobs/runs/submit";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.SubmitRunResponse;
    }

    /**
     * submit and wait to reach TERMINATED or SKIPPED state
     *  or fail on reaching INTERNAL_ERROR state
     */
    async submitAndWait({
        request,
        timeout,
        cancellationToken,
        onProgress = async (newPollResponse) => {},
    }: {
        request: model.SubmitRun;
        timeout?: Time;
        cancellationToken?: CancellationToken;
        onProgress?: (newPollResponse: model.Run) => Promise<void>;
    }): Promise<model.Run> {
        const response = await this.submit(request);

        return await retry<model.Run>({
            timeout: timeout,
            fn: async () => {
                const pollResponse = await this.getRun(
                    {
                        run_id: response.run_id!,
                    },
                    cancellationToken
                );
                if (cancellationToken?.isCancellationRequested) {
                    throw new JobsError("submitAndWait", "cancelled");
                }
                await onProgress(pollResponse);
                const status = pollResponse.state!.life_cycle_state;
                const statusMessage = pollResponse.state!.state_message;
                switch (status) {
                    case "TERMINATED":
                    case "SKIPPED": {
                        return pollResponse;
                    }
                    case "INTERNAL_ERROR": {
                        throw new JobsError(
                            "submitAndWait",
                            `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new JobsRetriableError(
                            "submitAndWait",
                            `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    /**
     * Partially updates a job
     *
     * Add, update, or remove specific settings of an existing job. Use the
     * ResetJob to overwrite all job settings.
     */
    async update(
        request: model.UpdateJob,
        cancellationToken?: CancellationToken
    ): Promise<model.UpdateResponse> {
        const path = "/api/2.1/jobs/update";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.UpdateResponse;
    }
}
