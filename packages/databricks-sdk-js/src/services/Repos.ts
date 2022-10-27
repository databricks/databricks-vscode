/* eslint-disable @typescript-eslint/naming-convention */
import {ApiClient} from "../api-client";
import {ListRequest, ReposService, RepoInfo} from "../apis/repos";
import {paginated} from "../decorators";
import {CancellationToken} from "../types";

export interface RepoList {
    repos: Repo[];
    next_page_token: any;
}

export class RepoError extends Error {}

export class Repos {
    constructor(private readonly client: ApiClient) {}
    @paginated<ListRequest, RepoList>("next_page_token", "repos")
    async paginatedList(
        req: ListRequest,
        _token?: CancellationToken
    ): Promise<RepoList> {
        const reposApi = new ReposService(this.client);
        return {
            repos:
                (await reposApi.list(req)).repos?.map(
                    (details) => new Repo(this.client, details)
                ) ?? [],
            next_page_token: req["next_page_token"],
        };
    }
}
export class Repo {
    private readonly reposApi;

    constructor(private readonly client: ApiClient, private details: RepoInfo) {
        this.reposApi = new ReposService(this.client);
    }

    async refresh() {
        this.details = await this.reposApi.get({repo_id: this.id});
        return this.details;
    }

    get id(): number {
        return this.details.id!;
    }

    get path(): string {
        return this.details.path!;
    }

    get url(): Promise<string> {
        return (async () =>
            `${(await this.client.host).host}#folder/${this.id}`)();
    }

    static async list(
        client: ApiClient,
        req: ListRequest,
        _token?: CancellationToken
    ) {
        return (await new Repos(client).paginatedList(req, _token)).repos;
    }

    static async fromPath(
        client: ApiClient,
        path: string,
        _token?: CancellationToken
    ) {
        const repos = await this.list(
            client,
            {
                path_prefix: path,
            },
            _token
        );

        const exactRepo = repos.find((repo) => repo.path === path);
        if (repos.length !== 1 && !exactRepo) {
            throw new RepoError(`${repos.length} repos match prefix ${path}`);
        }

        return exactRepo ?? repos[0];
    }
}
