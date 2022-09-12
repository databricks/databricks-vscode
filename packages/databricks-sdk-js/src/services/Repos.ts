import {ApiClient} from "../api-client";
import {ListRequest, ListReposResponse, ReposService} from "../apis/repos";
import {paginated} from "../decorators";
import {CancellationToken} from "../types";

export class Repos {
    constructor(private readonly client: ApiClient) {}

    @paginated<ListRequest, ListReposResponse>("next_page_token", "repos")
    async getRepos(
        req: ListRequest,
        _token?: CancellationToken
    ): Promise<ListReposResponse> {
        const reposApi = new ReposService(this.client);
        return await reposApi.list(req);
    }
}
