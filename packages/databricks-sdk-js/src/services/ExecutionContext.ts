import {cluster} from "..";
import {ApiClient} from "../api-client";
import {ExecutionContextService, Language} from "../apis/executionContext";
import {Cluster} from "./Cluster";
import {Command, CommandWithResult, StatusUpdateListener} from "./Command";

export class ExecutionContext {
    readonly executionContextApi: ExecutionContextService;
    id?: string;

    constructor(
        readonly client: ApiClient,
        readonly cluster: Cluster,
        readonly language: Language
    ) {
        this.executionContextApi = new ExecutionContextService(client);
    }

    static async create(
        client: ApiClient,
        cluster: Cluster,
        language: Language = "python"
    ): Promise<ExecutionContext> {
        let context = new ExecutionContext(client, cluster, language);
        let response = await context.executionContextApi.create({
            clusterId: context.cluster.id,
            language: context.language,
        });

        context.id = response.id;
        return context;
    }

    async execute(
        command: string,
        onStatusUpdate: StatusUpdateListener = () => {}
    ): Promise<CommandWithResult> {
        return await Command.execute(this, command, onStatusUpdate);
    }

    async destroy() {
        if (!this.id) {
            return;
        }

        await this.executionContextApi.destroy({
            clusterId: this.cluster.id,
            contextId: this.id,
        });
    }
}
