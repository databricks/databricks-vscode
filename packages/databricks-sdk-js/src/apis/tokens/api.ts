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

export class TokensRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Tokens", method, message);
    }
}
export class TokensError extends ApiError {
    constructor(method: string, message?: string) {
        super("Tokens", method, message);
    }
}

/**
 * The Token API allows you to create, list, and revoke tokens that can be used
 * to authenticate and access Databricks REST APIs.
 */
export class TokensService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create a user token.
     *
     * Creates and returns a token for a user. If this call is made through token
     * authentication, it creates a token with the same client ID as the
     * authenticated token. If the user's token quota is exceeded, this call
     * returns an error **QUOTA_EXCEEDED**.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateTokenRequest,
        @context context?: Context
    ): Promise<model.CreateTokenResponse> {
        const path = "/api/2.0/token/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.CreateTokenResponse;
    }

    /**
     * Revoke token.
     *
     * Revokes an access token.
     *
     * If a token with the specified ID is not valid, this call returns an error
     * **RESOURCE_DOES_NOT_EXIST**.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.RevokeTokenRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/token/delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.EmptyResponse;
    }

    /**
     * List tokens.
     *
     * Lists all the valid tokens for a user-workspace pair.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(@context context?: Context): Promise<model.ListTokensResponse> {
        const path = "/api/2.0/token/list";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as unknown as model.ListTokensResponse;
    }
}
