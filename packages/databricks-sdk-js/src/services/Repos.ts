import {ApiClient} from "../api-client";
import {GetReposRequest, GetReposResponse, ReposService} from "../apis/repos";
import {paginated} from "../decorators";
import {CancellationToken} from "../types";

export class Repos {
    constructor(private readonly client: ApiClient) {}

    @paginated<GetReposRequest, GetReposResponse>("next_page_token", "repos")
    async getRepos(
        req: GetReposRequest,
        _token?: CancellationToken
    ): Promise<GetReposResponse> {
        const reposApi = new ReposService(this.client);
        return await reposApi.getRepos(req);
    }
}
