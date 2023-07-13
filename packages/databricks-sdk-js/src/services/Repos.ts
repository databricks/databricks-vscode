/* eslint-disable @typescript-eslint/naming-convention */
import {ApiClient} from "../api-client";
import {List, ReposService, RepoInfo, CreateRepo} from "../apis/repos";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {context} from "../context";
import {Context} from "../context";
import {ExposedLoggers, withLogContext} from "../logging";

export interface RepoList {
    repos: Repo[];
    next_page_token: any;
}

export class RepoError extends Error {}

export class Repo {
    private readonly reposApi;

    constructor(
        private readonly client: ApiClient,
        private details: RepoInfo
    ) {
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

    @withLogContext(ExposedLoggers.SDK)
    static async create(
        client: ApiClient,
        req: CreateRepo,
        @context context?: Context
    ) {
        const repoService = new ReposService(client);
        return new Repo(client, await repoService.create(req, context));
    }

    @withLogContext(ExposedLoggers.SDK)
    static async *list(
        client: ApiClient,
        req: List,
        @context context?: Context
    ): AsyncIterable<Repo> {
        const reposApi = new ReposService(client);

        for await (const repo of reposApi.list(req, context)) {
            yield new Repo(client, repo);
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    static async fromPath(
        client: ApiClient,
        path: string,
        @context context?: Context
    ) {
        const repos: Array<Repo> = [];
        let exactRepo: Repo | undefined;
        for await (const repo of this.list(
            client,
            {
                path_prefix: path,
            },
            context
        )) {
            if (repo.path === path) {
                exactRepo = repo;
            }
            repos.push(repo);
        }

        if (repos.length !== 1 && !exactRepo) {
            throw new RepoError(`${repos.length} repos match prefix ${path}`);
        }

        return exactRepo ?? repos[0];
    }
}
