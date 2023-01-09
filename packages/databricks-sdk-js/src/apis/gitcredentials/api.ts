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

export class GitCredentialsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("GitCredentials", method, message);
    }
}
export class GitCredentialsError extends ApiError {
    constructor(method: string, message?: string) {
        super("GitCredentials", method, message);
    }
}

/**
 * Registers personal access token for Databricks to do operations on behalf of
 * the user.
 *
 * See [more info].
 *
 * [more info]: https://docs.databricks.com/repos/get-access-tokens-from-git-provider.html
 */
export class GitCredentialsService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create a credential entry.
     *
     * Creates a Git credential entry for the user. Only one Git credential per
     * user is supported, so any attempts to create credentials if an entry
     * already exists will fail. Use the PATCH endpoint to update existing
     * credentials, or the DELETE endpoint to delete existing credentials.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateCredentials,
        @context context?: Context
    ): Promise<model.CreateCredentialsResponse> {
        const path = "/api/2.0/git-credentials";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreateCredentialsResponse;
    }

    /**
     * Delete a credential.
     *
     * Deletes the specified Git credential.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.Delete,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/git-credentials/${request.credential_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Get a credential entry.
     *
     * Gets the Git credential with the specified credential ID.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.Get,
        @context context?: Context
    ): Promise<model.CredentialInfo> {
        const path = `/api/2.0/git-credentials/${request.credential_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.CredentialInfo;
    }

    /**
     * Get Git credentials.
     *
     * Lists the calling user's Git credentials. One credential per user is
     * supported.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        @context context?: Context
    ): Promise<model.GetCredentialsResponse> {
        const path = "/api/2.0/git-credentials";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.GetCredentialsResponse;
    }

    /**
     * Update a credential.
     *
     * Updates the specified Git credential.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateCredentials,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/git-credentials/${request.credential_id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
    }
}
