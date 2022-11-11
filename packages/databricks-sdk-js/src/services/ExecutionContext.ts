import {CancellationToken, CommandExecutionService, commands} from "..";
import {ApiClient} from "../api-client";
import {Cluster} from "./Cluster";
import {Command, CommandWithResult, StatusUpdateListener} from "./Command";

export class ExecutionContext {
    readonly executionContextApi: CommandExecutionService;
    id?: string;

    private constructor(
        readonly client: ApiClient,
        readonly cluster: Cluster,
        readonly language: commands.Language
    ) {
        this.executionContextApi = new CommandExecutionService(client);
    }

    static async create(
        client: ApiClient,
        cluster: Cluster,
        language: commands.Language = "python"
    ): Promise<ExecutionContext> {
        const context = new ExecutionContext(client, cluster, language);
        const response = await context.executionContextApi.createAndWait({
            clusterId: context.cluster.id,
            language: context.language,
        });

        context.id = response.id;
        return context;
    }

    async execute(
        command: string,
        onStatusUpdate: StatusUpdateListener = () => {},
        token?: CancellationToken
    ): Promise<CommandWithResult> {
        return await Command.execute(this, command, onStatusUpdate, token);
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
