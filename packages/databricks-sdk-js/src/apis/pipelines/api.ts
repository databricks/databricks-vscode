/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

import {ApiClient} from "../../api-client";
import * as model from "./model";
import Time from "../../retries/Time";
import retry from "../../retries/retries";
import {CancellationToken} from "../../types";
import {ApiError, ApiRetriableError} from "../apiError";
import {context, Context} from "../../context";
import {ExposedLoggers, withLogContext} from "../../logging";
import {Waiter, asWaiter} from "../../wait";

export class PipelinesRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Pipelines", method, message);
    }
}
export class PipelinesError extends ApiError {
    constructor(method: string, message?: string) {
        super("Pipelines", method, message);
    }
}

/**
 * The Delta Live Tables API allows you to create, edit, delete, start, and view
 * details about pipelines.
 *
 * Delta Live Tables is a framework for building reliable, maintainable, and
 * testable data processing pipelines. You define the transformations to perform
 * on your data, and Delta Live Tables manages task orchestration, cluster
 * management, monitoring, data quality, and error handling.
 *
 * Instead of defining your data pipelines using a series of separate Apache
 * Spark tasks, Delta Live Tables manages how your data is transformed based on a
 * target schema you define for each processing step. You can also enforce data
 * quality with Delta Live Tables expectations. Expectations allow you to define
 * expected data quality and specify how to handle records that fail those
 * expectations.
 */
export class PipelinesService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.CreatePipeline,
        @context context?: Context
    ): Promise<model.CreatePipelineResponse> {
        const path = "/api/2.0/pipelines";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreatePipelineResponse;
    }

    /**
     * Create a pipeline.
     *
     * Creates a new data processing pipeline based on the requested
     * configuration. If successful, this method returns the ID of the new
     * pipeline.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreatePipeline,
        @context context?: Context
    ): Promise<model.CreatePipelineResponse> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.Delete,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/pipelines/${request.pipeline_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a pipeline.
     *
     * Deletes a pipeline.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.Delete,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.Get,
        @context context?: Context
    ): Promise<model.GetPipelineResponse> {
        const path = `/api/2.0/pipelines/${request.pipeline_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetPipelineResponse;
    }

    /**
     * Get a pipeline.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        get: model.Get,
        @context context?: Context
    ): Promise<Waiter<model.GetPipelineResponse, model.GetPipelineResponse>> {
        const cancellationToken = context?.cancellationToken;

        const getPipelineResponse = await this._get(get, context);

        return asWaiter(getPipelineResponse, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

            return await retry<model.GetPipelineResponse>({
                timeout,
                fn: async () => {
                    const pollResponse = await this.get(
                        {
                            pipeline_id: getPipelineResponse.pipeline_id!,
                        },
                        context
                    );
                    if (cancellationToken?.isCancellationRequested) {
                        context?.logger?.error(
                            "Pipelines.getAndWait: cancelled"
                        );
                        throw new PipelinesError("getAndWait", "cancelled");
                    }
                    await onProgress(pollResponse);
                    const status = pollResponse.state;
                    const statusMessage = pollResponse.cause;
                    switch (status) {
                        case "RUNNING": {
                            return pollResponse;
                        }
                        case "FAILED": {
                            const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Pipelines.getAndWait: ${errorMessage}`
                            );
                            throw new PipelinesError(
                                "getAndWait",
                                errorMessage
                            );
                        }
                        default: {
                            const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Pipelines.getAndWait: retrying: ${errorMessage}`
                            );
                            throw new PipelinesRetriableError(
                                "getAndWait",
                                errorMessage
                            );
                        }
                    }
                },
            });
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _getUpdate(
        request: model.GetUpdate,
        @context context?: Context
    ): Promise<model.GetUpdateResponse> {
        const path = `/api/2.0/pipelines/${request.pipeline_id}/updates/${request.update_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetUpdateResponse;
    }

    /**
     * Get a pipeline update.
     *
     * Gets an update from an active pipeline.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getUpdate(
        request: model.GetUpdate,
        @context context?: Context
    ): Promise<model.GetUpdateResponse> {
        return await this._getUpdate(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _listPipelineEvents(
        request: model.ListPipelineEvents,
        @context context?: Context
    ): Promise<model.ListPipelineEventsResponse> {
        const path = `/api/2.0/pipelines/${request.pipeline_id}/events`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListPipelineEventsResponse;
    }

    /**
     * List pipeline events.
     *
     * Retrieves events for a pipeline.
     */
    @withLogContext(ExposedLoggers.SDK)
    async listPipelineEvents(
        request: model.ListPipelineEvents,
        @context context?: Context
    ): Promise<model.ListPipelineEventsResponse> {
        return await this._listPipelineEvents(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _listPipelines(
        request: model.ListPipelines,
        @context context?: Context
    ): Promise<model.ListPipelinesResponse> {
        const path = "/api/2.0/pipelines";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListPipelinesResponse;
    }

    /**
     * List pipelines.
     *
     * Lists pipelines defined in the Delta Live Tables system.
     */
    @withLogContext(ExposedLoggers.SDK)
    async listPipelines(
        request: model.ListPipelines,
        @context context?: Context
    ): Promise<model.ListPipelinesResponse> {
        return await this._listPipelines(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _listUpdates(
        request: model.ListUpdates,
        @context context?: Context
    ): Promise<model.ListUpdatesResponse> {
        const path = `/api/2.0/pipelines/${request.pipeline_id}/updates`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListUpdatesResponse;
    }

    /**
     * List pipeline updates.
     *
     * List updates for an active pipeline.
     */
    @withLogContext(ExposedLoggers.SDK)
    async listUpdates(
        request: model.ListUpdates,
        @context context?: Context
    ): Promise<model.ListUpdatesResponse> {
        return await this._listUpdates(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _reset(
        request: model.Reset,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/pipelines/${request.pipeline_id}/reset`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Reset a pipeline.
     *
     * Resets a pipeline.
     */
    @withLogContext(ExposedLoggers.SDK)
    async reset(
        reset: model.Reset,
        @context context?: Context
    ): Promise<Waiter<model.EmptyResponse, model.GetPipelineResponse>> {
        const cancellationToken = context?.cancellationToken;

        await this._reset(reset, context);

        return asWaiter(null, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

            return await retry<model.GetPipelineResponse>({
                timeout,
                fn: async () => {
                    const pollResponse = await this.get(
                        {
                            pipeline_id: reset.pipeline_id!,
                        },
                        context
                    );
                    if (cancellationToken?.isCancellationRequested) {
                        context?.logger?.error(
                            "Pipelines.resetAndWait: cancelled"
                        );
                        throw new PipelinesError("resetAndWait", "cancelled");
                    }
                    await onProgress(pollResponse);
                    const status = pollResponse.state;
                    const statusMessage = pollResponse.cause;
                    switch (status) {
                        case "RUNNING": {
                            return pollResponse;
                        }
                        case "FAILED": {
                            const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Pipelines.resetAndWait: ${errorMessage}`
                            );
                            throw new PipelinesError(
                                "resetAndWait",
                                errorMessage
                            );
                        }
                        default: {
                            const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Pipelines.resetAndWait: retrying: ${errorMessage}`
                            );
                            throw new PipelinesRetriableError(
                                "resetAndWait",
                                errorMessage
                            );
                        }
                    }
                },
            });
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _startUpdate(
        request: model.StartUpdate,
        @context context?: Context
    ): Promise<model.StartUpdateResponse> {
        const path = `/api/2.0/pipelines/${request.pipeline_id}/updates`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.StartUpdateResponse;
    }

    /**
     * Queue a pipeline update.
     *
     * Starts or queues a pipeline update.
     */
    @withLogContext(ExposedLoggers.SDK)
    async startUpdate(
        request: model.StartUpdate,
        @context context?: Context
    ): Promise<model.StartUpdateResponse> {
        return await this._startUpdate(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _stop(
        request: model.Stop,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/pipelines/${request.pipeline_id}/stop`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Stop a pipeline.
     *
     * Stops a pipeline.
     */
    @withLogContext(ExposedLoggers.SDK)
    async stop(
        stop: model.Stop,
        @context context?: Context
    ): Promise<Waiter<model.EmptyResponse, model.GetPipelineResponse>> {
        const cancellationToken = context?.cancellationToken;

        await this._stop(stop, context);

        return asWaiter(null, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

            return await retry<model.GetPipelineResponse>({
                timeout,
                fn: async () => {
                    const pollResponse = await this.get(
                        {
                            pipeline_id: stop.pipeline_id!,
                        },
                        context
                    );
                    if (cancellationToken?.isCancellationRequested) {
                        context?.logger?.error(
                            "Pipelines.stopAndWait: cancelled"
                        );
                        throw new PipelinesError("stopAndWait", "cancelled");
                    }
                    await onProgress(pollResponse);
                    const status = pollResponse.state;
                    const statusMessage = pollResponse.cause;
                    switch (status) {
                        case "IDLE": {
                            return pollResponse;
                        }
                        case "FAILED": {
                            const errorMessage = `failed to reach IDLE state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Pipelines.stopAndWait: ${errorMessage}`
                            );
                            throw new PipelinesError(
                                "stopAndWait",
                                errorMessage
                            );
                        }
                        default: {
                            const errorMessage = `failed to reach IDLE state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Pipelines.stopAndWait: retrying: ${errorMessage}`
                            );
                            throw new PipelinesRetriableError(
                                "stopAndWait",
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
        request: model.EditPipeline,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/pipelines/${request.pipeline_id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Edit a pipeline.
     *
     * Updates a pipeline with the supplied configuration.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.EditPipeline,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._update(request, context);
    }
}
