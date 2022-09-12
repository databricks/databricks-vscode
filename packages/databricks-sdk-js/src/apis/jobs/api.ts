/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

import {ApiClient} from "../../api-client";
import * as model from "./model";
import Time from "../../retries/Time";
import retry, {RetriableError} from "../../retries/retries";
export class JobsRetriableError extends RetriableError {}
export class JobsError extends Error {}
// The Jobs API allows you to create, edit, and delete jobs.
export class JobsService {
    constructor(readonly client: ApiClient) {}
    // Cancels all active runs of a job. The runs are canceled asynchronously,
    // so it doesn't prevent new runs from being started.
    async cancelAllRuns(
        request: model.CancelAllRuns
    ): Promise<model.CancelAllRunsResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/cancel-all",
            "POST",
            request
        )) as model.CancelAllRunsResponse;
    }

    // Cancels a job run. The run is canceled asynchronously, so it may still be
    // running when this request completes.
    async cancelRun(
        request: model.CancelRun
    ): Promise<model.CancelRunResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/cancel",
            "POST",
            request
        )) as model.CancelRunResponse;
    }

    // cancelRun and wait to reach TERMINATED or SKIPPED state
    //  or fail on reaching INTERNAL_ERROR state
    async cancelRunAndWait(
        request: model.CancelRun,
        timeout?: Time
    ): Promise<model.Run> {
        const response = await this.cancelRun(request);

        return await retry<model.Run>({
            timeout: timeout,
            fn: async () => {
                const pollResponse = await this.getRun({
                    ...model.DefaultGetRunRequest,
                    run_id: request.run_id,
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

    // Create a new job.
    async create(request: model.CreateJob): Promise<model.CreateResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/create",
            "POST",
            request
        )) as model.CreateResponse;
    }

    // Deletes a job.
    async delete(request: model.DeleteJob): Promise<model.DeleteResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/delete",
            "POST",
            request
        )) as model.DeleteResponse;
    }

    // Deletes a non-active run. Returns an error if the run is active.
    async deleteRun(
        request: model.DeleteRun
    ): Promise<model.DeleteRunResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/delete",
            "POST",
            request
        )) as model.DeleteRunResponse;
    }

    // Export and retrieve the job run task.
    async exportRun(
        request: model.ExportRunRequest
    ): Promise<model.ExportRunOutput> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/export",
            "GET",
            request
        )) as model.ExportRunOutput;
    }

    // Retrieves the details for a single job.
    async get(request: model.GetRequest): Promise<model.Job> {
        return (await this.client.request(
            "/api/2.1/jobs/get",
            "GET",
            request
        )) as model.Job;
    }

    // Retrieve the metadata of a run.
    async getRun(request: model.GetRunRequest): Promise<model.Run> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/get",
            "GET",
            request
        )) as model.Run;
    }

    // getRun and wait to reach TERMINATED or SKIPPED state
    //  or fail on reaching INTERNAL_ERROR state
    async getRunAndWait(
        request: model.GetRunRequest,
        timeout?: Time
    ): Promise<model.Run> {
        const response = await this.getRun(request);

        return await retry<model.Run>({
            timeout: timeout,
            fn: async () => {
                const pollResponse = await this.getRun({
                    ...model.DefaultGetRunRequest,
                    run_id: response.run_id,
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

    // Retrieve the output and metadata of a single task run. When a notebook
    // task returns a value through the dbutils.notebook.exit() call, you can
    // use this endpoint to retrieve that value. jobs restricts this API to
    // return the first 5 MB of the output. To return a larger result, you can
    // store job results in a cloud storage service. This endpoint validates
    // that the run_id parameter is valid and returns an HTTP status code 400 if
    // the run_id parameter is invalid. Runs are automatically removed after 60
    // days. If you to want to reference them beyond 60 days, you must save old
    // run results before they expire. To export using the UI, see Export job
    // run results. To export using the Jobs API, see Runs export.
    async getRunOutput(
        request: model.GetRunOutputRequest
    ): Promise<model.RunOutput> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/get-output",
            "GET",
            request
        )) as model.RunOutput;
    }

    // Retrieves a list of jobs.
    async list(request: model.ListRequest): Promise<model.ListResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/list",
            "GET",
            request
        )) as model.ListResponse;
    }

    // List runs in descending order by start time.
    async listRuns(
        request: model.ListRunsRequest
    ): Promise<model.ListRunsResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/list",
            "GET",
            request
        )) as model.ListRunsResponse;
    }

    // Re-run one or more tasks. Tasks are re-run as part of the original job
    // run, use the current job and task settings, and can be viewed in the
    // history for the original job run.
    async repairRun(
        request: model.RepairRun
    ): Promise<model.RepairRunResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/repair",
            "POST",
            request
        )) as model.RepairRunResponse;
    }

    // repairRun and wait to reach TERMINATED or SKIPPED state
    //  or fail on reaching INTERNAL_ERROR state
    async repairRunAndWait(
        request: model.RepairRun,
        timeout?: Time
    ): Promise<model.Run> {
        const response = await this.repairRun(request);

        return await retry<model.Run>({
            timeout: timeout,
            fn: async () => {
                const pollResponse = await this.getRun({
                    ...model.DefaultGetRunRequest,
                    run_id: request.run_id,
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

    // Overwrites all the settings for a specific job. Use the Update endpoint
    // to update job settings partially.
    async reset(request: model.ResetJob): Promise<model.ResetResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/reset",
            "POST",
            request
        )) as model.ResetResponse;
    }

    // Run a job and return the `run_id` of the triggered run.
    async runNow(request: model.RunNow): Promise<model.RunNowResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/run-now",
            "POST",
            request
        )) as model.RunNowResponse;
    }

    // runNow and wait to reach TERMINATED or SKIPPED state
    //  or fail on reaching INTERNAL_ERROR state
    async runNowAndWait(
        request: model.RunNow,
        timeout?: Time
    ): Promise<model.Run> {
        const response = await this.runNow(request);

        return await retry<model.Run>({
            timeout: timeout,
            fn: async () => {
                const pollResponse = await this.getRun({
                    ...model.DefaultGetRunRequest,
                    run_id: response.run_id,
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

    // Submit a one-time run. This endpoint allows you to submit a workload
    // directly without creating a job. Runs submitted using this endpoint don?t
    // display in the UI. Use the `jobs/runs/get` API to check the run state
    // after the job is submitted.
    async submit(request: model.SubmitRun): Promise<model.SubmitRunResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/runs/submit",
            "POST",
            request
        )) as model.SubmitRunResponse;
    }

    // submit and wait to reach TERMINATED or SKIPPED state
    //  or fail on reaching INTERNAL_ERROR state
    async submitAndWait(
        request: model.SubmitRun,
        timeout?: Time
    ): Promise<model.Run> {
        const response = await this.submit(request);

        return await retry<model.Run>({
            timeout: timeout,
            fn: async () => {
                const pollResponse = await this.getRun({
                    ...model.DefaultGetRunRequest,
                    run_id: response.run_id,
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

    // Add, update, or remove specific settings of an existing job. Use the
    // ResetJob to overwrite all job settings.
    async update(request: model.UpdateJob): Promise<model.UpdateResponse> {
        return (await this.client.request(
            "/api/2.1/jobs/update",
            "POST",
            request
        )) as model.UpdateResponse;
    }
}
