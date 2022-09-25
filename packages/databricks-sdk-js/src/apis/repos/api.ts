/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

import {ApiClient} from "../../api-client";
import * as model from "./model";
import Time from "../../retries/Time";
import retry from "../../retries/retries";
import {CancellationToken} from "../../types";
import {ApiError, ApiRetriableError} from "../apiError";
export class ReposRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("$s.PascalName", method, message);
    }
}
export class ReposError extends ApiError {
    constructor(method: string, message?: string) {
        super("$s.PascalName", method, message);
    }
}

/**
 * The Repos API allows users to manage their git repos. Users can use the API to
 * access all repos that they have manage permissions on.
 */
export class ReposService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create a repo
     *
     * Creates a repo in the workspace and links it to the remote Git repo
     * specified. Note that repos created programmatically must be linked to a
     * remote Git repo, unlike repos created in the browser.
     */
    async create(
        request: model.CreateRepo,
        cancellationToken?: CancellationToken
    ): Promise<model.RepoInfo> {
        const path = "/api/2.0/repos";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.RepoInfo;
    }

    /**
     * Deletes the repo
     *
     * Deletes the specified repo
     */
    async delete(
        request: model.DeleteRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.DeleteResponse> {
        const path = `/api/2.0/repos/${request.repo_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            cancellationToken
        )) as model.DeleteResponse;
    }

    /**
     * Get a repo
     *
     * Returns the repo with the given repo ID.
     */
    async get(
        request: model.GetRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.RepoInfo> {
        const path = `/api/2.0/repos/${request.repo_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            cancellationToken
        )) as model.RepoInfo;
    }

    /**
     * Get repos
     *
     * Returns repos that the calling user has Manage permissions on. Results are
     * paginated with each page containing twenty repos.
     */
    async list(
        request: model.ListRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.ListReposResponse> {
        const path = "/api/2.0/repos";
        return (await this.client.request(
            path,
            "GET",
            request,
            cancellationToken
        )) as model.ListReposResponse;
    }

    /**
     * Updates the repo to the given branch or tag
     *
     * Updates the repo to a different branch or tag, or updates the repo to the
     * latest commit on the same branch.
     */
    async update(
        request: model.UpdateRepo,
        cancellationToken?: CancellationToken
    ): Promise<model.UpdateResponse> {
        const path = `/api/2.0/repos/${request.repo_id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            cancellationToken
        )) as model.UpdateResponse;
    }
}
