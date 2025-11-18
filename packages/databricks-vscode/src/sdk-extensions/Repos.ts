/* eslint-disable @typescript-eslint/naming-convention */
import {ApiClient, workspace, logging} from "@databricks/sdk-experimental";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {context, Context} from "@databricks/sdk-experimental/dist/context";

export interface RepoList {
    repos: Repo[];
    next_page_token: any;
}

export class RepoError extends Error {}

export class Repo {
    private readonly reposApi;

    constructor(
        private readonly client: ApiClient,
        private details: workspace.RepoInfo
    ) {
        this.reposApi = new workspace.ReposService(this.client);
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

    @logging.withLogContext(logging.ExposedLoggers.SDK)
    static async create(
        client: ApiClient,
        req: workspace.CreateRepoRequest,
        @context context?: Context
    ) {
        const repoService = new workspace.ReposService(client);
        return new Repo(client, await repoService.create(req, context));
    }

    @logging.withLogContext(logging.ExposedLoggers.SDK)
    static async *list(
        client: ApiClient,
        req: workspace.ListReposRequest,
        @context context?: Context
    ): AsyncIterable<Repo> {
        const reposApi = new workspace.ReposService(client);

        for await (const repo of reposApi.list(req, context)) {
            yield new Repo(client, repo);
        }
    }

    @logging.withLogContext(logging.ExposedLoggers.SDK)
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
