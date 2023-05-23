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

    @withLogContext(ExposedLoggers.SDK)
    private async _createOboToken(
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
     * Create on-behalf token.
     *
     * Creates a token on behalf of a service principal.
     */
    @withLogContext(ExposedLoggers.SDK)
    async createOboToken(
        request: model.CreateOboTokenRequest,
        @context context?: Context
    ): Promise<model.CreateOboTokenResponse> {
        return await this._createOboToken(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
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
     * Delete a token.
     *
     * Deletes a token, specified by its ID.
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
     * Get token info.
     *
     * Gets information about a token, specified by its ID.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.Get,
        @context context?: Context
    ): Promise<model.TokenInfo> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
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

    /**
     * List all tokens.
     *
     * Lists all tokens associated with the specified workspace or user.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        request: model.List,
        @context context?: Context
    ): AsyncIterable<model.TokenInfo> {
        const response = (await this._list(request, context)).token_infos;
        for (const v of response || []) {
            yield v;
        }
    }
}
