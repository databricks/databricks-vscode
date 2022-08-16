import {EventEmitter} from "events";
import retry, {RetriableError} from "../retries/retries";
import {ExecutionContext} from "./ExecutionContext";
import {CommandsService, CommandsStatusResponse} from "../apis/commands";

interface CommandErrorParams {
    commandId: string;
    clusterId: string;
    contextId: string;
    message?: string;
}

function getCommandErrorMessage(errorParams: CommandErrorParams): string {
    return `Command [${errorParams.commandId}] Context [${errorParams.contextId}] Cluster [${errorParams.clusterId}]: ${errorParams.message}`;
}
class CommandRetriableError extends RetriableError {
    constructor(errorParams: CommandErrorParams) {
        super(getCommandErrorMessage(errorParams));
    }
}
class CommandError extends Error {
    constructor(errorParams: CommandErrorParams) {
        super(getCommandErrorMessage(errorParams));
    }
}

export interface CommandWithResult {
    cmd: Command;
    result: CommandsStatusResponse;
}

export type StatusUpdateListener = (result: CommandsStatusResponse) => void;

export class Command extends EventEmitter {
    readonly context: ExecutionContext;
    readonly commandsApi: CommandsService;
    id?: string;

    private static statusUpdateEvent: string = "statusUpdate";

    constructor(context: ExecutionContext) {
        super();
        this.context = context;
        this.commandsApi = new CommandsService(context.client);
    }

    private get commandErrorParams(): CommandErrorParams {
        return {
            commandId: this.id!,
            clusterId: this.context.cluster.id,
            contextId: this.context.id!,
        };
    }

    async response(): Promise<CommandsStatusResponse> {
        const result = await retry({
            fn: async () => {
                let result = await this.commandsApi.status({
                    clusterId: this.context.cluster.id,
                    contextId: this.context.id!,
                    commandId: this.id!,
                });

                this.emit(Command.statusUpdateEvent, result);

                if (
                    !["Cancelled", "Error", "Finished"].includes(result.status)
                ) {
                    throw new CommandRetriableError({
                        ...this.commandErrorParams,
                        message: `Current state of command is ${result.status}`,
                    });
                }

                return result;
            },
        });

        if (!result) {
            throw new CommandError({
                ...this.commandErrorParams,
                message: `Command did not return a result`,
            });
        }

        return result;
    }

    static async execute(
        context: ExecutionContext,
        command: string,
        onStatusUpdate: StatusUpdateListener = () => {}
    ): Promise<CommandWithResult> {
        let cmd = new Command(context);

        cmd.on(Command.statusUpdateEvent, onStatusUpdate);

        const executeApiResponse = await cmd.commandsApi.execute({
            clusterId: cmd.context.cluster.id,
            contextId: cmd.context.id!,
            language: cmd.context.language,
            command,
        });

        cmd.id = executeApiResponse.id;

        const executionResult = await cmd.response();

        return {cmd: cmd, result: executionResult};
    }
}
