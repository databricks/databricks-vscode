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

export class CustomAppIntegrationRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("CustomAppIntegration", method, message);
    }
}
export class CustomAppIntegrationError extends ApiError {
    constructor(method: string, message?: string) {
        super("CustomAppIntegration", method, message);
    }
}

/**
 * These APIs enable administrators to manage custom oauth app integrations,
 * which is required for adding/using Custom OAuth App Integration like Tableau
 * Cloud for Databricks in AWS cloud.
 *
 * **Note:** You can only add/use the OAuth custom application integrations when
 * OAuth enrollment status is enabled. For more details see
 * :method:OAuthEnrollment/create
 */
export class CustomAppIntegrationService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create Custom OAuth App Integration.
     *
     * Create Custom OAuth App Integration.
     *
     * You can retrieve the custom oauth app integration via :method:get.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateCustomAppIntegration,
        @context context?: Context
    ): Promise<model.CreateCustomAppIntegrationOutput> {
        const path = `/api/2.0/accounts/${this.client.accountId}/oauth2/custom-app-integration/${request.integration_id}`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreateCustomAppIntegrationOutput;
    }

    /**
     * Delete Custom OAuth App Integration.
     *
     * Delete an existing Custom OAuth App Integration. You can retrieve the
     * custom oauth app integration via :method:get.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteCustomAppIntegrationRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/oauth2/custom-app-integration/${request.integration_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Get OAuth Custom App Integration.
     *
     * Gets the Custom OAuth App Integration for the given integration id.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetCustomAppIntegrationRequest,
        @context context?: Context
    ): Promise<model.GetCustomAppIntegrationOutput> {
        const path = `/api/2.0/accounts/${this.client.accountId}/oauth2/custom-app-integration/${request.integration_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetCustomAppIntegrationOutput;
    }

    /**
     * Updates Custom OAuth App Integration.
     *
     * Updates an existing custom OAuth App Integration. You can retrieve the
     * custom oauth app integration via :method:get.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateCustomAppIntegration,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/oauth2/custom-app-integration/${request.integration_id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
    }
}

export class PublishedAppIntegrationRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("PublishedAppIntegration", method, message);
    }
}
export class PublishedAppIntegrationError extends ApiError {
    constructor(method: string, message?: string) {
        super("PublishedAppIntegration", method, message);
    }
}

/**
 * These APIs enable administrators to manage published oauth app integrations,
 * which is required for adding/using Published OAuth App Integration like
 * Tableau Cloud for Databricks in AWS cloud.
 *
 * **Note:** You can only add/use the OAuth published application integrations
 * when OAuth enrollment status is enabled. For more details see
 * :method:OAuthEnrollment/create
 */
export class PublishedAppIntegrationService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create Published OAuth App Integration.
     *
     * Create Published OAuth App Integration.
     *
     * You can retrieve the published oauth app integration via :method:get.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreatePublishedAppIntegration,
        @context context?: Context
    ): Promise<model.CreatePublishedAppIntegrationOutput> {
        const path = `/api/2.0/accounts/${this.client.accountId}/oauth2/published-app-integration/${request.integration_id}`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreatePublishedAppIntegrationOutput;
    }

    /**
     * Delete Published OAuth App Integration.
     *
     * Delete an existing Published OAuth App Integration. You can retrieve the
     * published oauth app integration via :method:get.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeletePublishedAppIntegrationRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/oauth2/published-app-integration/${request.integration_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Get OAuth Published App Integration.
     *
     * Gets the Published OAuth App Integration for the given integration id.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetPublishedAppIntegrationRequest,
        @context context?: Context
    ): Promise<model.GetPublishedAppIntegrationOutput> {
        const path = `/api/2.0/accounts/${this.client.accountId}/oauth2/published-app-integration/${request.integration_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetPublishedAppIntegrationOutput;
    }

    /**
     * Updates Published OAuth App Integration.
     *
     * Updates an existing published OAuth App Integration. You can retrieve the
     * published oauth app integration via :method:get.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdatePublishedAppIntegration,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/oauth2/published-app-integration/${request.integration_id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
    }
}
