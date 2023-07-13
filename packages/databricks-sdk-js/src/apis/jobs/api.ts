/* eslint-disable @typescript-eslint/naming-convention */
// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

/**
 * The Jobs API allows you to create, edit, and delete jobs.
 */

import {ApiClient} from "../../api-client";
import * as jobs from "./model";
import {EmptyResponse} from "../../types";
import Time from "../../retries/Time";
import retry from "../../retries/retries";
import {CancellationToken} from "../../types";
import {ApiError, ApiRetriableError} from "../apiError";
import {context, Context} from "../../context";
import {ExposedLoggers, withLogContext} from "../../logging";
import {Waiter, asWaiter} from "../../wait";

import * as compute from "../compute";
import * as iam from "../iam";

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
 *
 * You can use a Databricks job to run a data processing or data analysis task in
 * a Databricks cluster with scalable resources. Your job can consist of a single
 * task or can be a large, multi-task workflow with complex dependencies.
 * Databricks manages the task orchestration, cluster management, monitoring, and
 * error reporting for all of your jobs. You can run your jobs immediately or
 * periodically through an easy-to-use scheduling system. You can implement job
 * tasks using notebooks, JARS, Delta Live Tables pipelines, or Python, Scala,
 * Spark submit, and Java applications.
 *
 * You should never hard code secrets or store them in plain text. Use the
 * [Secrets CLI] to manage secrets in the [Databricks CLI]. Use the [Secrets
 * utility] to reference secrets in notebooks and jobs.
 *
 * [Databricks CLI]: https://docs.databricks.com/dev-tools/cli/index.html
 * [Secrets CLI]: https://docs.databricks.com/dev-tools/cli/secrets-cli.html
 * [Secrets utility]: https://docs.databricks.com/dev-tools/databricks-utils.html#dbutils-secrets
 */
export class JobsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _cancelAllRuns(
        request: jobs.CancelAllRuns,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = "/api/2.1/jobs/runs/cancel-all";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Cancel all runs of a job.
     *
     * Cancels all active runs of a job. The runs are canceled asynchronously, so
     * it doesn't prevent new runs from being started.
     */
    @withLogContext(ExposedLoggers.SDK)
    async cancelAllRuns(
        request: jobs.CancelAllRuns,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._cancelAllRuns(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _cancelRun(
        request: jobs.CancelRun,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = "/api/2.1/jobs/runs/cancel";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Cancel a job run.
     *
     * Cancels a job run. The run is canceled asynchronously, so it may still be
     * running when this request completes.
     */
    @withLogContext(ExposedLoggers.SDK)
    async cancelRun(
        cancelRun: jobs.CancelRun,
        @context context?: Context
    ): Promise<Waiter<EmptyResponse, jobs.Run>> {
        const cancellationToken = context?.cancellationToken;

        await this._cancelRun(cancelRun, context);

        return asWaiter(null, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

            return await retry<jobs.Run>({
                timeout,
                fn: async () => {
                    const pollResponse = await this.getRun(
                        {
                            run_id: cancelRun.run_id!,
                        },
                        context
                    );
                    if (cancellationToken?.isCancellationRequested) {
                        context?.logger?.error(
                            "Jobs.cancelRunAndWait: cancelled"
                        );
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
                            const errorMessage = `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Jobs.cancelRunAndWait: ${errorMessage}`
                            );
                            throw new JobsError(
                                "cancelRunAndWait",
                                errorMessage
                            );
                        }
                        default: {
                            const errorMessage = `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Jobs.cancelRunAndWait: retrying: ${errorMessage}`
                            );
                            throw new JobsRetriableError(
                                "cancelRunAndWait",
                                errorMessage
                            );
                        }
                    }
                },
            });
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: jobs.CreateJob,
        @context context?: Context
    ): Promise<jobs.CreateResponse> {
        const path = "/api/2.1/jobs/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as jobs.CreateResponse;
    }

    /**
     * Create a new job.
     *
     * Create a new job.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: jobs.CreateJob,
        @context context?: Context
    ): Promise<jobs.CreateResponse> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: jobs.DeleteJob,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = "/api/2.1/jobs/delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Delete a job.
     *
     * Deletes a job.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: jobs.DeleteJob,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _deleteRun(
        request: jobs.DeleteRun,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = "/api/2.1/jobs/runs/delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Delete a job run.
     *
     * Deletes a non-active run. Returns an error if the run is active.
     */
    @withLogContext(ExposedLoggers.SDK)
    async deleteRun(
        request: jobs.DeleteRun,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._deleteRun(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _exportRun(
        request: jobs.ExportRunRequest,
        @context context?: Context
    ): Promise<jobs.ExportRunOutput> {
        const path = "/api/2.1/jobs/runs/export";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as jobs.ExportRunOutput;
    }

    /**
     * Export and retrieve a job run.
     *
     * Export and retrieve the job run task.
     */
    @withLogContext(ExposedLoggers.SDK)
    async exportRun(
        request: jobs.ExportRunRequest,
        @context context?: Context
    ): Promise<jobs.ExportRunOutput> {
        return await this._exportRun(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: jobs.GetJobRequest,
        @context context?: Context
    ): Promise<jobs.Job> {
        const path = "/api/2.1/jobs/get";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as jobs.Job;
    }

    /**
     * Get a single job.
     *
     * Retrieves the details for a single job.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: jobs.GetJobRequest,
        @context context?: Context
    ): Promise<jobs.Job> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _getRun(
        request: jobs.GetRunRequest,
        @context context?: Context
    ): Promise<jobs.Run> {
        const path = "/api/2.1/jobs/runs/get";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as jobs.Run;
    }

    /**
     * Get a single job run.
     *
     * Retrieve the metadata of a run.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getRun(
        getRunRequest: jobs.GetRunRequest,
        @context context?: Context
    ): Promise<Waiter<jobs.Run, jobs.Run>> {
        const cancellationToken = context?.cancellationToken;

        const run = await this._getRun(getRunRequest, context);

        return asWaiter(run, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

            return await retry<jobs.Run>({
                timeout,
                fn: async () => {
                    const pollResponse = await this.getRun(
                        {
                            run_id: run.run_id!,
                        },
                        context
                    );
                    if (cancellationToken?.isCancellationRequested) {
                        context?.logger?.error("Jobs.getRunAndWait: cancelled");
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
                            const errorMessage = `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Jobs.getRunAndWait: ${errorMessage}`
                            );
                            throw new JobsError("getRunAndWait", errorMessage);
                        }
                        default: {
                            const errorMessage = `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Jobs.getRunAndWait: retrying: ${errorMessage}`
                            );
                            throw new JobsRetriableError(
                                "getRunAndWait",
                                errorMessage
                            );
                        }
                    }
                },
            });
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _getRunOutput(
        request: jobs.GetRunOutputRequest,
        @context context?: Context
    ): Promise<jobs.RunOutput> {
        const path = "/api/2.1/jobs/runs/get-output";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as jobs.RunOutput;
    }

    /**
     * Get the output for a single run.
     *
     * Retrieve the output and metadata of a single task run. When a notebook
     * task returns a value through the `dbutils.notebook.exit()` call, you can
     * use this endpoint to retrieve that value. Databricks restricts this API to
     * returning the first 5 MB of the output. To return a larger result, you can
     * store job results in a cloud storage service.
     *
     * This endpoint validates that the __run_id__ parameter is valid and returns
     * an HTTP status code 400 if the __run_id__ parameter is invalid. Runs are
     * automatically removed after 60 days. If you to want to reference them
     * beyond 60 days, you must save old run results before they expire.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getRunOutput(
        request: jobs.GetRunOutputRequest,
        @context context?: Context
    ): Promise<jobs.RunOutput> {
        return await this._getRunOutput(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: jobs.ListJobsRequest,
        @context context?: Context
    ): Promise<jobs.ListJobsResponse> {
        const path = "/api/2.1/jobs/list";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as jobs.ListJobsResponse;
    }

    /**
     * List jobs.
     *
     * Retrieves a list of jobs.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        request: jobs.ListJobsRequest,
        @context context?: Context
    ): AsyncIterable<jobs.BaseJob> {
        while (true) {
            const response = await this._list(request, context);
            if (
                context?.cancellationToken &&
                context?.cancellationToken.isCancellationRequested
            ) {
                break;
            }

            if (!response.jobs || response.jobs.length === 0) {
                break;
            }

            for (const v of response.jobs) {
                yield v;
            }

            request.page_token = response.next_page_token;
            if (!response.next_page_token) {
                break;
            }
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _listRuns(
        request: jobs.ListRunsRequest,
        @context context?: Context
    ): Promise<jobs.ListRunsResponse> {
        const path = "/api/2.1/jobs/runs/list";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as jobs.ListRunsResponse;
    }

    /**
     * List job runs.
     *
     * List runs in descending order by start time.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *listRuns(
        request: jobs.ListRunsRequest,
        @context context?: Context
    ): AsyncIterable<jobs.BaseRun> {
        while (true) {
            const response = await this._listRuns(request, context);
            if (
                context?.cancellationToken &&
                context?.cancellationToken.isCancellationRequested
            ) {
                break;
            }

            if (!response.runs || response.runs.length === 0) {
                break;
            }

            for (const v of response.runs) {
                yield v;
            }

            request.page_token = response.next_page_token;
            if (!response.next_page_token) {
                break;
            }
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _repairRun(
        request: jobs.RepairRun,
        @context context?: Context
    ): Promise<jobs.RepairRunResponse> {
        const path = "/api/2.1/jobs/runs/repair";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as jobs.RepairRunResponse;
    }

    /**
     * Repair a job run.
     *
     * Re-run one or more tasks. Tasks are re-run as part of the original job
     * run. They use the current job and task settings, and can be viewed in the
     * history for the original job run.
     */
    @withLogContext(ExposedLoggers.SDK)
    async repairRun(
        repairRun: jobs.RepairRun,
        @context context?: Context
    ): Promise<Waiter<jobs.RepairRunResponse, jobs.Run>> {
        const cancellationToken = context?.cancellationToken;

        const repairRunResponse = await this._repairRun(repairRun, context);

        return asWaiter(repairRunResponse, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

            return await retry<jobs.Run>({
                timeout,
                fn: async () => {
                    const pollResponse = await this.getRun(
                        {
                            run_id: repairRun.run_id!,
                        },
                        context
                    );
                    if (cancellationToken?.isCancellationRequested) {
                        context?.logger?.error(
                            "Jobs.repairRunAndWait: cancelled"
                        );
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
                            const errorMessage = `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Jobs.repairRunAndWait: ${errorMessage}`
                            );
                            throw new JobsError(
                                "repairRunAndWait",
                                errorMessage
                            );
                        }
                        default: {
                            const errorMessage = `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Jobs.repairRunAndWait: retrying: ${errorMessage}`
                            );
                            throw new JobsRetriableError(
                                "repairRunAndWait",
                                errorMessage
                            );
                        }
                    }
                },
            });
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _reset(
        request: jobs.ResetJob,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = "/api/2.1/jobs/reset";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Overwrites all settings for a job.
     *
     * Overwrites all the settings for a specific job. Use the Update endpoint to
     * update job settings partially.
     */
    @withLogContext(ExposedLoggers.SDK)
    async reset(
        request: jobs.ResetJob,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._reset(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _runNow(
        request: jobs.RunNow,
        @context context?: Context
    ): Promise<jobs.RunNowResponse> {
        const path = "/api/2.1/jobs/run-now";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as jobs.RunNowResponse;
    }

    /**
     * Trigger a new job run.
     *
     * Run a job and return the `run_id` of the triggered run.
     */
    @withLogContext(ExposedLoggers.SDK)
    async runNow(
        runNow: jobs.RunNow,
        @context context?: Context
    ): Promise<Waiter<jobs.RunNowResponse, jobs.Run>> {
        const cancellationToken = context?.cancellationToken;

        const runNowResponse = await this._runNow(runNow, context);

        return asWaiter(runNowResponse, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

            return await retry<jobs.Run>({
                timeout,
                fn: async () => {
                    const pollResponse = await this.getRun(
                        {
                            run_id: runNowResponse.run_id!,
                        },
                        context
                    );
                    if (cancellationToken?.isCancellationRequested) {
                        context?.logger?.error("Jobs.runNowAndWait: cancelled");
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
                            const errorMessage = `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Jobs.runNowAndWait: ${errorMessage}`
                            );
                            throw new JobsError("runNowAndWait", errorMessage);
                        }
                        default: {
                            const errorMessage = `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Jobs.runNowAndWait: retrying: ${errorMessage}`
                            );
                            throw new JobsRetriableError(
                                "runNowAndWait",
                                errorMessage
                            );
                        }
                    }
                },
            });
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _submit(
        request: jobs.SubmitRun,
        @context context?: Context
    ): Promise<jobs.SubmitRunResponse> {
        const path = "/api/2.1/jobs/runs/submit";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as jobs.SubmitRunResponse;
    }

    /**
     * Create and trigger a one-time run.
     *
     * Submit a one-time run. This endpoint allows you to submit a workload
     * directly without creating a job. Runs submitted using this endpoint
     * don’t display in the UI. Use the `jobs/runs/get` API to check the run
     * state after the job is submitted.
     */
    @withLogContext(ExposedLoggers.SDK)
    async submit(
        submitRun: jobs.SubmitRun,
        @context context?: Context
    ): Promise<Waiter<jobs.SubmitRunResponse, jobs.Run>> {
        const cancellationToken = context?.cancellationToken;

        const submitRunResponse = await this._submit(submitRun, context);

        return asWaiter(submitRunResponse, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

            return await retry<jobs.Run>({
                timeout,
                fn: async () => {
                    const pollResponse = await this.getRun(
                        {
                            run_id: submitRunResponse.run_id!,
                        },
                        context
                    );
                    if (cancellationToken?.isCancellationRequested) {
                        context?.logger?.error("Jobs.submitAndWait: cancelled");
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
                            const errorMessage = `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Jobs.submitAndWait: ${errorMessage}`
                            );
                            throw new JobsError("submitAndWait", errorMessage);
                        }
                        default: {
                            const errorMessage = `failed to reach TERMINATED or SKIPPED state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Jobs.submitAndWait: retrying: ${errorMessage}`
                            );
                            throw new JobsRetriableError(
                                "submitAndWait",
                                errorMessage
                            );
                        }
                    }
                },
            });
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: jobs.UpdateJob,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = "/api/2.1/jobs/update";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Partially update a job.
     *
     * Add, update, or remove specific settings of an existing job. Use the
     * ResetJob to overwrite all job settings.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: jobs.UpdateJob,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._update(request, context);
    }
}
