/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
export interface CreateRepo {
    path?: string;
    provider: string;
    url: string;
}

export interface ListReposResponse {
    next_page_token?: string;
    repos?: Array<RepoInfo>;
}

export interface RepoInfo {
    branch?: string;
    head_commit_id?: string;
    id?: number;
    path?: string;
    provider?: string;
    url?: string;
}

export interface UpdateRepo {
    branch?: string;
    /**
     * The ID for the corresponding repo to access.
     */
    repo_id: number;
    tag?: string;
}

/**
 * Branch that the local version of the repo is checked out to.
 */

export interface DeleteRequest {
    /**
     * The ID for the corresponding repo to access.
     */
    repo_id: number;
}

export interface GetRequest {
    /**
     * The ID for the corresponding repo to access.
     */
    repo_id: number;
}

/**
 * SHA-1 hash representing the commit ID of the current HEAD of the repo.
 */

/**
 * ID of the repo object in the workspace.
 */

export interface ListRequest {
    /**
     * Token used to get the next page of results. If not specified, returns the
     * first page of results as well as a next page token if there are more
     * results.
     */
    next_page_token?: string;
    /**
     * Filters repos that have paths starting with the given path prefix.
     */
    path_prefix?: string;
}

/**
 * Token that can be specified as a query parameter to the GET /repos endpoint to
 * retrieve the next page of results.
 */

/**
 * Desired path for the repo in the workspace. Must be in the format
 * /Repos/{folder}/{repo-name}.
 */

/**
 * Git provider. This field is case-insensitive. The available Git providers are
 * gitHub, bitbucketCloud, gitLab, azureDevOpsServices, gitHubEnterprise,
 * bitbucketServer, gitLabEnterpriseEdition and awsCodeCommit.
 */

/**
 * Tag that the local version of the repo is checked out to. Updating the repo to
 * a tag puts the repo in a detached HEAD state. Before committing new changes,
 * you must update the repo to a branch instead of the detached HEAD.
 */

/**
 * URL of the Git repository to be linked.
 */

export interface DeleteResponse {}
export interface UpdateResponse {}
