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
        const path = "/api/2.0/pipelines";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreatePipelineResponse;
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
        const path = `/api/2.0/pipelines/${request.pipeline_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Get a pipeline.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
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
     * get and wait to reach RUNNING state
     *  or fail on reaching FAILED state
     */
    @withLogContext(ExposedLoggers.SDK)
    async getAndWait(
        get: model.Get,
        options?: {
            timeout?: Time;
            onProgress?: (
                newPollResponse: model.GetPipelineResponse
            ) => Promise<void>;
        },
        @context context?: Context
    ): Promise<model.GetPipelineResponse> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        const {timeout, onProgress} = options;
        const cancellationToken = context?.cancellationToken;

        const getPipelineResponse = await this.get(get, context);

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
                    context?.logger?.error("Pipelines.getAndWait: cancelled");
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
                        throw new PipelinesError("getAndWait", errorMessage);
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
        const path = `/api/2.0/pipelines/${request.pipeline_id}/updates/${request.update_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetUpdateResponse;
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
        const path = "/api/2.0/pipelines";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListPipelinesResponse;
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
        const path = `/api/2.0/pipelines/${request.pipeline_id}/updates`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListUpdatesResponse;
    }

    /**
     * Reset a pipeline.
     *
     * Resets a pipeline.
     */
    @withLogContext(ExposedLoggers.SDK)
    async reset(
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
     * reset and wait to reach RUNNING state
     *  or fail on reaching FAILED state
     */
    @withLogContext(ExposedLoggers.SDK)
    async resetAndWait(
        reset: model.Reset,
        options?: {
            timeout?: Time;
            onProgress?: (
                newPollResponse: model.GetPipelineResponse
            ) => Promise<void>;
        },
        @context context?: Context
    ): Promise<model.GetPipelineResponse> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        const {timeout, onProgress} = options;
        const cancellationToken = context?.cancellationToken;

        await this.reset(reset, context);

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
                    context?.logger?.error("Pipelines.resetAndWait: cancelled");
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
                        throw new PipelinesError("resetAndWait", errorMessage);
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
        const path = `/api/2.0/pipelines/${request.pipeline_id}/updates`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.StartUpdateResponse;
    }

    /**
     * Stop a pipeline.
     *
     * Stops a pipeline.
     */
    @withLogContext(ExposedLoggers.SDK)
    async stop(
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
     * stop and wait to reach IDLE state
     *  or fail on reaching FAILED state
     */
    @withLogContext(ExposedLoggers.SDK)
    async stopAndWait(
        stop: model.Stop,
        options?: {
            timeout?: Time;
            onProgress?: (
                newPollResponse: model.GetPipelineResponse
            ) => Promise<void>;
        },
        @context context?: Context
    ): Promise<model.GetPipelineResponse> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        const {timeout, onProgress} = options;
        const cancellationToken = context?.cancellationToken;

        await this.stop(stop, context);

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
                    context?.logger?.error("Pipelines.stopAndWait: cancelled");
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
                        throw new PipelinesError("stopAndWait", errorMessage);
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
        const path = `/api/2.0/pipelines/${request.pipeline_id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.EmptyResponse;
    }
}
