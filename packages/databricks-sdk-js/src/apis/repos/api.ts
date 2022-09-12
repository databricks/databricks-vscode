/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

import {ApiClient} from "../../api-client";
import * as model from "./model";
import Time from "../../retries/Time";
import retry, {RetriableError} from "../../retries/retries";
export class ReposRetriableError extends RetriableError {}
export class ReposError extends Error {}

/**
 * The Repos API allows users to manage their git repos.
 */
export class ReposService {
    constructor(readonly client: ApiClient) {}
    /**
     * Creates a repo in the workspace and links it to the remote Git repo
     * specified. Note that repos created programmatically must be linked to a
     * remote Git repo, unlike repos created in the browser.
     */
    async create(request: model.CreateRepo): Promise<model.RepoInfo> {
        const path = "/api/2.0/repos";
        return (await this.client.request(
            path,
            "POST",
            request
        )) as model.RepoInfo;
    }

    /**
     * Deletes the specified repo
     */
    async delete(request: model.DeleteRequest): Promise<model.DeleteResponse> {
        const path = `/api/2.0/repos/${request.repo_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request
        )) as model.DeleteResponse;
    }

    /**
     * Returns the repo with the given repo ID.
     */
    async get(request: model.GetRequest): Promise<model.RepoInfo> {
        const path = `/api/2.0/repos/${request.repo_id}`;
        return (await this.client.request(
            path,
            "GET",
            request
        )) as model.RepoInfo;
    }

    /**
     * Returns repos that the calling user has Manage permissions on. Results are
     * paginated with each page containing twenty repos.
     */
    async list(request: model.ListRequest): Promise<model.ListReposResponse> {
        const path = "/api/2.0/repos";
        return (await this.client.request(
            path,
            "GET",
            request
        )) as model.ListReposResponse;
    }

    /**
     * Updates the repo to a different branch or tag, or updates the repo to the
     * latest commit on the same branch.
     */
    async update(request: model.UpdateRepo): Promise<model.UpdateResponse> {
        const path = `/api/2.0/repos/${request.repo_id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request
        )) as model.UpdateResponse;
    }
}
