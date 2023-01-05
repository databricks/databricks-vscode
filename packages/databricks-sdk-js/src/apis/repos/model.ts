/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
export interface CreateRepo {
    /**
     * Desired path for the repo in the workspace. Must be in the format
     * /Repos/{folder}/{repo-name}.
     */
    path?: string;
    /**
     * Git provider. This field is case-insensitive. The available Git providers
     * are gitHub, bitbucketCloud, gitLab, azureDevOpsServices, gitHubEnterprise,
     * bitbucketServer, gitLabEnterpriseEdition and awsCodeCommit.
     */
    provider: string;
    /**
     * If specified, the repo will be created with sparse checkout enabled. You
     * cannot enable/disable sparse checkout after the repo is created.
     */
    sparse_checkout?: SparseCheckout;
    /**
     * URL of the Git repository to be linked.
     */
    url: string;
}

/**
 * Delete a repo
 */
export interface Delete {
    /**
     * The ID for the corresponding repo to access.
     */
    repo_id: number;
}

/**
 * Get a repo
 */
export interface Get {
    /**
     * The ID for the corresponding repo to access.
     */
    repo_id: number;
}

/**
 * Get repos
 */
export interface List {
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

export interface ListReposResponse {
    /**
     * Token that can be specified as a query parameter to the GET /repos
     * endpoint to retrieve the next page of results.
     */
    next_page_token?: string;
    repos?: Array<RepoInfo>;
}

export interface RepoInfo {
    /**
     * Branch that the local version of the repo is checked out to.
     */
    branch?: string;
    /**
     * SHA-1 hash representing the commit ID of the current HEAD of the repo.
     */
    head_commit_id?: string;
    /**
     * ID of the repo object in the workspace.
     */
    id?: number;
    /**
     * Desired path for the repo in the workspace. Must be in the format
     * /Repos/{folder}/{repo-name}.
     */
    path?: string;
    /**
     * Git provider. This field is case-insensitive. The available Git providers
     * are gitHub, bitbucketCloud, gitLab, azureDevOpsServices, gitHubEnterprise,
     * bitbucketServer, gitLabEnterpriseEdition and awsCodeCommit.
     */
    provider?: string;
    sparse_checkout?: SparseCheckout;
    /**
     * URL of the Git repository to be linked.
     */
    url?: string;
}

export interface SparseCheckout {
    /**
     * List of patterns to include for sparse checkout.
     */
    patterns?: Array<string>;
}

/**
 * Sparse checkout cone pattern, see [cone mode handling] for details.
 *
 * [cone mode handling]: https://git-scm.com/docs/git-sparse-checkout#_internalscone_mode_handling
 */

export interface SparseCheckoutUpdate {
    /**
     * List of patterns to include for sparse checkout.
     */
    patterns?: Array<string>;
}

export interface UpdateRepo {
    /**
     * Branch that the local version of the repo is checked out to.
     */
    branch?: string;
    /**
     * The ID for the corresponding repo to access.
     */
    repo_id: number;
    /**
     * If specified, update the sparse checkout settings. The update will fail if
     * sparse checkout is not enabled for the repo.
     */
    sparse_checkout?: SparseCheckoutUpdate;
    /**
     * Tag that the local version of the repo is checked out to. Updating the
     * repo to a tag puts the repo in a detached HEAD state. Before committing
     * new changes, you must update the repo to a branch instead of the detached
     * HEAD.
     */
    tag?: string;
}

export interface EmptyResponse {}
