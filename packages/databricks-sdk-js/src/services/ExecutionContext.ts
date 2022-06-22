import {ApiClient} from "../api-client";
import {ExecutionContextApi, Language} from "../apis/executionContext";
import {Command} from "./Command";

export class ExecutionContext {
    readonly executionContextApi: ExecutionContextApi;
    readonly clusterId: string;
    readonly client: ApiClient;
    id?: string;

    constructor(client: ApiClient, clusterId: string) {
        this.client = client;
        this.executionContextApi = new ExecutionContextApi(client);
        this.clusterId = clusterId;
    }

    static async create(
        client: ApiClient,
        clusterId: string
    ): Promise<ExecutionContext> {
        let context = new ExecutionContext(client, clusterId);
        let response = await context.executionContextApi.create({
            clusterId: context.clusterId,
            language: "python",
        });

        context.id = response.id;
        return context;
    }

    async execute(
        command: string,
        language: Language = "python"
    ): Promise<Command> {
        return await Command.execute(this, command, language);
    }

    async destroy() {
        if (!this.id) {
            return;
        }

        await this.executionContextApi.destroy({
            clusterId: this.clusterId,
            contextId: this.id,
        });
    }
}
