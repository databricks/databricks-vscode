/* eslint-disable @typescript-eslint/naming-convention */
import {ApiClient} from "../api-client";

export interface GetRepoResponse {
    /**
     * ID of the repo object in the workspace.
     */
    id: number;

    /**
     * URL of the Git repository to be linked.
     */
    url?: string;

    /**
     * Git provider. This field is case-insensitive. The available Git providers are gitHub, bitbucketCloud, gitLab, azureDevOpsServices, gitHubEnterprise, bitbucketServer, gitLabEnterpriseEdition and awsCodeCommit.
     */
    provider?: string;

    /**
     * Desired path for the repo in the workspace. Must be in the format /Repos/{folder}/{repo-name}.
     */
    path: string;

    /**
     * Branch that the local version of the repo is checked out to.
     */
    branch?: string;

    /**
     * SHA-1 hash representing the commit ID of the current HEAD of the repo.
     */
    head_commit_id?: string;
}

export interface GetReposRequest {
    path_prefix?: string;
    next_page_token?: string;
}

export interface GetReposResponse {
    repos: Array<GetRepoResponse>;
    next_page_token?: string;
}

export interface CreateRepoRequest {
    /** URL of the Git repository to be linked. */
    url: string;
    provider: string;
    path?: string;
}

export interface DeleteRepoRequest {
    id: number;
}

export interface DeleteRepoResponse {}

export interface GetRepoRequest {
    id: number;
}

export interface UpdateRepoRequest {
    id: number;

    /** Branch that the local version of the repo is checked out to. */
    branch?: string;

    /**
     * Tag that the local version of the repo is checked out to. Updating the
     * repo to a tag puts the repo in a detached HEAD state. Before committing
     * new changes, you must update the repo to a branch instead of the
     * detached HEAD.
     */
    tag?: string;
}

/**
 * The repos API allows users to manage their
 * [repos](https://docs.databricks.com/repos.html). Users can use the API to
 * access all repos that they have manage permissions on.
 */
export class ReposService {
    constructor(readonly client: ApiClient) {}

    /**
     * Returns repos that the calling user has Manage permissions on. Results
     * are paginated with each page containing twenty repos.
     */
    async getRepos(req: GetReposRequest): Promise<GetReposResponse> {
        return (await this.client.request(
            "/api/2.0/repos",
            "GET",
            req
        )) as GetReposResponse;
    }

    /**
     * Creates a repo in the workspace and links it to the remote Git repo
     * specified. Note that repos created programmatically must be linked to a
     * remote Git repo, unlike repos created in the browser.
     */
    async createRepo(req: CreateRepoRequest): Promise<GetRepoResponse> {
        return (await this.client.request(
            "/api/2.0/repos",
            "POST",
            req
        )) as GetRepoResponse;
    }

    /**
     * Returns the repo with the given repo ID.
     */
    async getRepo(req: GetRepoRequest): Promise<GetRepoResponse> {
        return (await this.client.request(
            `/api/2.0/repos/${req.id}`,
            "GET",
            req
        )) as GetRepoResponse;
    }

    /**
     * Updates the repo to a different branch or tag, or updates the repo to
     * the latest commit on the same branch.
     */
    async updateRepo(req: UpdateRepoRequest): Promise<GetRepoResponse> {
        return (await this.client.request(
            `/api/2.0/repos/${req.id}`,
            "PATCH",
            req
        )) as GetRepoResponse;
    }

    /**
     * Deletes the specified repo
     */
    async deleteRepo(req: DeleteRepoRequest): Promise<DeleteRepoResponse> {
        return (await this.client.request(
            `/api/2.0/repos/${req.id}`,
            "DELETE",
            req
        )) as DeleteRepoResponse;
    }
}
