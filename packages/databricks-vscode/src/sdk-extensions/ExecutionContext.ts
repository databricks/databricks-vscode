import {
    ApiClient,
    CancellationToken,
    Time,
    compute,
    retries,
} from "@databricks/sdk-experimental";
import {Cluster} from "./Cluster";
import {Command, CommandWithResult, StatusUpdateListener} from "./Command";

export class ExecutionContext {
    readonly executionContextApi: compute.CommandExecutionService;
    id?: string;

    private constructor(
        readonly client: ApiClient,
        readonly cluster: Cluster,
        readonly language: compute.Language
    ) {
        this.executionContextApi = new compute.CommandExecutionService(client);
    }

    static async create(
        client: ApiClient,
        cluster: Cluster,
        language: compute.Language = "python"
    ): Promise<ExecutionContext> {
        const context = new ExecutionContext(client, cluster, language);
        const response = await (
            await context.executionContextApi.create({
                clusterId: context.cluster.id,
                language: context.language,
            })
        ).wait();

        context.id = response.id;
        return context;
    }

    async execute(
        command: string,
        onStatusUpdate: StatusUpdateListener = () => {},
        token?: CancellationToken,
        timeout: Time = retries.DEFAULT_MAX_TIMEOUT
    ): Promise<CommandWithResult> {
        return await Command.execute(
            this,
            command,
            onStatusUpdate,
            token,
            timeout
        );
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
