import {CancellationToken, Time} from "..";
import {ApiClient} from "../api-client";
import {CommandExecutionService, Language} from "../apis/commands";
import {DEFAULT_MAX_TIMEOUT} from "../retries/retries";
import {Cluster} from "./Cluster";
import {Command, CommandWithResult, StatusUpdateListener} from "./Command";

export class ExecutionContext {
    readonly executionContextApi: CommandExecutionService;
    id?: string;

    private constructor(
        readonly client: ApiClient,
        readonly cluster: Cluster,
        readonly language: Language
    ) {
        this.executionContextApi = new CommandExecutionService(client);
    }

    static async create(
        client: ApiClient,
        cluster: Cluster,
        language: Language = "python"
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
        token?: CancellationToken,
        timeout: Time | undefined = DEFAULT_MAX_TIMEOUT
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
