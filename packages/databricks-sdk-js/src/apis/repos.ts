/* eslint-disable @typescript-eslint/naming-convention */
import {ApiClient} from "../api-client";
import {paginated} from "../decorators";

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

export class ReposService {
    constructor(readonly client: ApiClient) {}

    @paginated<GetReposRequest, GetReposResponse>("next_page_token", "repos")
    async getRepos(req: GetReposRequest): Promise<GetReposResponse> {
        return (await this.client.request(
            "/api/2.0/repos",
            "GET",
            req
        )) as GetReposResponse;
    }

    // TODO: add missing calls
}
