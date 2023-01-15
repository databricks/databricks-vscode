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

export class TokenManagementRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("TokenManagement", method, message);
    }
}
export class TokenManagementError extends ApiError {
    constructor(method: string, message?: string) {
        super("TokenManagement", method, message);
    }
}

/**
 * Enables administrators to get all tokens and delete tokens for other users.
 * Admins can either get every token, get a specific token by ID, or get all
 * tokens for a particular user.
 */
export class TokenManagementService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create on-behalf token.
     *
     * Creates a token on behalf of a service principal.
     */
    @withLogContext(ExposedLoggers.SDK)
    async createOboToken(
        request: model.CreateOboTokenRequest,
        @context context?: Context
    ): Promise<model.CreateOboTokenResponse> {
        const path = "/api/2.0/token-management/on-behalf-of/tokens";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreateOboTokenResponse;
    }

    /**
     * Delete a token.
     *
     * Deletes a token, specified by its ID.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.Delete,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/token-management/tokens/${request.token_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Get token info.
     *
     * Gets information about a token, specified by its ID.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.Get,
        @context context?: Context
    ): Promise<model.TokenInfo> {
        const path = `/api/2.0/token-management/tokens/${request.token_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.TokenInfo;
    }

    /**
     * List all tokens.
     *
     * Lists all tokens associated with the specified workspace or user.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.List,
        @context context?: Context
    ): Promise<model.ListTokensResponse> {
        const path = "/api/2.0/token-management/tokens";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListTokensResponse;
    }
}
