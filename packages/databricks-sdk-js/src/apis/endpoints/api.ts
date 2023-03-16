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

export class ServingEndpointsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("ServingEndpoints", method, message);
    }
}
export class ServingEndpointsError extends ApiError {
    constructor(method: string, message?: string) {
        super("ServingEndpoints", method, message);
    }
}

/**
 * The Serving Endpoints API allows you to create, update, and delete model
 * serving endpoints.
 *
 * You can use a serving endpoint to serve models from the Databricks Model
 * Registry. Endpoints expose the underlying models as scalable REST API
 * endpoints using serverless compute. This means the endpoints and associated
 * compute resources are fully managed by Databricks and will not appear in your
 * cloud account. A serving endpoint can consist of one or more MLflow models
 * from the Databricks Model Registry, called served models. A serving endpoint
 * can have at most ten served models. You can configure traffic settings to
 * define how requests should be routed to your served models behind an endpoint.
 * Additionally, you can configure the scale of resources that should be applied
 * to each served model.
 */
export class ServingEndpointsService {
    constructor(readonly client: ApiClient) {}
    /**
     * Retrieve the logs associated with building the model's environment for a
     * given serving endpoint's served model.
     *
     * Retrieves the build logs associated with the provided served model.
     */
    @withLogContext(ExposedLoggers.SDK)
    async buildLogs(
        request: model.BuildLogsRequest,
        @context context?: Context
    ): Promise<model.BuildLogsResponse> {
        const path = `/api/2.0/serving-endpoints/${request.name}/served-models/${request.served_model_name}/build-logs`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.BuildLogsResponse;
    }

    /**
     * Create a new serving endpoint.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateServingEndpoint,
        @context context?: Context
    ): Promise<model.ServingEndpointDetailed> {
        const path = "/api/2.0/serving-endpoints";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.ServingEndpointDetailed;
    }

    /**
     * create and wait to reach NOT_UPDATING state
     *  or fail on reaching UPDATE_FAILED state
     */
    @withLogContext(ExposedLoggers.SDK)
    async createAndWait(
        createServingEndpoint: model.CreateServingEndpoint,
        options?: {
            timeout?: Time;
            onProgress?: (
                newPollResponse: model.ServingEndpointDetailed
            ) => Promise<void>;
        },
        @context context?: Context
    ): Promise<model.ServingEndpointDetailed> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        const {timeout, onProgress} = options;
        const cancellationToken = context?.cancellationToken;

        const servingEndpointDetailed = await this.create(
            createServingEndpoint,
            context
        );

        return await retry<model.ServingEndpointDetailed>({
            timeout,
            fn: async () => {
                const pollResponse = await this.get(
                    {
                        name: servingEndpointDetailed.name!,
                    },
                    context
                );
                if (cancellationToken?.isCancellationRequested) {
                    context?.logger?.error(
                        "ServingEndpoints.createAndWait: cancelled"
                    );
                    throw new ServingEndpointsError(
                        "createAndWait",
                        "cancelled"
                    );
                }
                await onProgress(pollResponse);
                const status = pollResponse.state!.config_update;
                const statusMessage = pollResponse;
                switch (status) {
                    case "NOT_UPDATING": {
                        return pollResponse;
                    }
                    case "UPDATE_FAILED": {
                        const errorMessage = `failed to reach NOT_UPDATING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `ServingEndpoints.createAndWait: ${errorMessage}`
                        );
                        throw new ServingEndpointsError(
                            "createAndWait",
                            errorMessage
                        );
                    }
                    default: {
                        const errorMessage = `failed to reach NOT_UPDATING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `ServingEndpoints.createAndWait: retrying: ${errorMessage}`
                        );
                        throw new ServingEndpointsRetriableError(
                            "createAndWait",
                            errorMessage
                        );
                    }
                }
            },
        });
    }

    /**
     * Delete a serving endpoint.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteServingEndpointRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/serving-endpoints/${request.name}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Retrieve the metrics corresponding to a serving endpoint for the current
     * time in Prometheus or OpenMetrics exposition format.
     *
     * Retrieves the metrics associated with the provided serving endpoint in
     * either Prometheus or OpenMetrics exposition format.
     */
    @withLogContext(ExposedLoggers.SDK)
    async exportMetrics(
        request: model.ExportMetricsRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/serving-endpoints/${request.name}/metrics`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Get a single serving endpoint.
     *
     * Retrieves the details for a single serving endpoint.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetServingEndpointRequest,
        @context context?: Context
    ): Promise<model.ServingEndpointDetailed> {
        const path = `/api/2.0/serving-endpoints/${request.name}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ServingEndpointDetailed;
    }

    /**
     * Retrieve all serving endpoints.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        @context context?: Context
    ): Promise<model.ListEndpointsResponse> {
        const path = "/api/2.0/serving-endpoints";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.ListEndpointsResponse;
    }

    /**
     * Retrieve the most recent log lines associated with a given serving
     * endpoint's served model.
     *
     * Retrieves the service logs associated with the provided served model.
     */
    @withLogContext(ExposedLoggers.SDK)
    async logs(
        request: model.LogsRequest,
        @context context?: Context
    ): Promise<model.ServerLogsResponse> {
        const path = `/api/2.0/serving-endpoints/${request.name}/served-models/${request.served_model_name}/logs`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ServerLogsResponse;
    }

    /**
     * Query a serving endpoint with provided model input.
     */
    @withLogContext(ExposedLoggers.SDK)
    async query(
        request: model.QueryRequest,
        @context context?: Context
    ): Promise<model.QueryEndpointResponse> {
        const path = `/serving-endpoints/${request.name}/invocations`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.QueryEndpointResponse;
    }

    /**
     * Update a serving endpoint with a new config.
     *
     * Updates any combination of the serving endpoint's served models, the
     * compute configuration of those served models, and the endpoint's traffic
     * config. An endpoint that already has an update in progress can not be
     * updated until the current update completes or fails.
     */
    @withLogContext(ExposedLoggers.SDK)
    async updateConfig(
        request: model.EndpointCoreConfigInput,
        @context context?: Context
    ): Promise<model.ServingEndpointDetailed> {
        const path = `/api/2.0/serving-endpoints/${request.name}/config`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.ServingEndpointDetailed;
    }

    /**
     * updateConfig and wait to reach NOT_UPDATING state
     *  or fail on reaching UPDATE_FAILED state
     */
    @withLogContext(ExposedLoggers.SDK)
    async updateConfigAndWait(
        endpointCoreConfigInput: model.EndpointCoreConfigInput,
        options?: {
            timeout?: Time;
            onProgress?: (
                newPollResponse: model.ServingEndpointDetailed
            ) => Promise<void>;
        },
        @context context?: Context
    ): Promise<model.ServingEndpointDetailed> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        const {timeout, onProgress} = options;
        const cancellationToken = context?.cancellationToken;

        const servingEndpointDetailed = await this.updateConfig(
            endpointCoreConfigInput,
            context
        );

        return await retry<model.ServingEndpointDetailed>({
            timeout,
            fn: async () => {
                const pollResponse = await this.get(
                    {
                        name: servingEndpointDetailed.name!,
                    },
                    context
                );
                if (cancellationToken?.isCancellationRequested) {
                    context?.logger?.error(
                        "ServingEndpoints.updateConfigAndWait: cancelled"
                    );
                    throw new ServingEndpointsError(
                        "updateConfigAndWait",
                        "cancelled"
                    );
                }
                await onProgress(pollResponse);
                const status = pollResponse.state!.config_update;
                const statusMessage = pollResponse;
                switch (status) {
                    case "NOT_UPDATING": {
                        return pollResponse;
                    }
                    case "UPDATE_FAILED": {
                        const errorMessage = `failed to reach NOT_UPDATING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `ServingEndpoints.updateConfigAndWait: ${errorMessage}`
                        );
                        throw new ServingEndpointsError(
                            "updateConfigAndWait",
                            errorMessage
                        );
                    }
                    default: {
                        const errorMessage = `failed to reach NOT_UPDATING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `ServingEndpoints.updateConfigAndWait: retrying: ${errorMessage}`
                        );
                        throw new ServingEndpointsRetriableError(
                            "updateConfigAndWait",
                            errorMessage
                        );
                    }
                }
            },
        });
    }
}
