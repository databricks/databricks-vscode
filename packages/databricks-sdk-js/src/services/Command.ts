import {EventEmitter} from "events";
import retry, {DEFAULT_MAX_TIMEOUT, RetriableError} from "../retries/retries";
import {ExecutionContext} from "./ExecutionContext";
import {CancellationToken} from "../types";
import {CommandExecutionService, CommandStatusResponse} from "../apis/commands";
import Time from "../retries/Time";

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
    result: CommandStatusResponse;
}

export type StatusUpdateListener = (result: CommandStatusResponse) => void;

export class Command extends EventEmitter {
    readonly context: ExecutionContext;
    readonly commandsApi: CommandExecutionService;
    result?: CommandStatusResponse;
    id?: string;

    private static statusUpdateEvent = "statusUpdate";

    private constructor(context: ExecutionContext) {
        super();
        this.context = context;
        this.commandsApi = new CommandExecutionService(context.client);
    }

    private get commandErrorParams(): CommandErrorParams {
        return {
            commandId: this.id!,
            clusterId: this.context.cluster.id,
            contextId: this.context.id!,
        };
    }

    async refresh() {
        this.result = await this.commandsApi.commandStatus({
            clusterId: this.context.cluster.id,
            contextId: this.context.id!,
            commandId: this.id!,
        });
    }

    async cancel() {
        await this.commandsApi.cancel({
            commandId: this.id!,
            contextId: this.context.id!,
            clusterId: this.context.cluster.id!,
        });

        await retry({
            fn: async () => {
                await this.refresh();
                // The API surfaces an exception when a command is cancelled
                // The cancellation itself proceeds as expected, but the status
                // is FINISHED instead of CANCELLED.
                if (
                    this.result!.results?.resultType === "error" &&
                    !this.result!.results!.cause!.includes(
                        "CommandCancelledException"
                    )
                ) {
                    throw new CommandError({
                        ...this.commandErrorParams,
                        message: this.result!.results.cause,
                    });
                }

                if (["Cancelled", "Finished"].includes(this.result!.status!)) {
                    return;
                }

                if (this.result!.status === "Error") {
                    throw new CommandError({
                        ...this.commandErrorParams,
                        message: "Error while cancelling the command",
                    });
                }

                throw new CommandRetriableError({
                    ...this.commandErrorParams,
                    message: `Current state of command is ${
                        this.result!.status
                    }`,
                });
            },
        });
    }

    async response(
        cancellationToken?: CancellationToken,
        timeout: Time | undefined = DEFAULT_MAX_TIMEOUT
    ): Promise<CommandStatusResponse> {
        await retry({
            timeout: timeout,
            fn: async () => {
                await this.refresh();

                this.emit(Command.statusUpdateEvent, this.result!);

                if (
                    !["Cancelled", "Error", "Finished"].includes(
                        this.result!.status!
                    )
                ) {
                    if (cancellationToken?.isCancellationRequested) {
                        await this.cancel();
                        return;
                    }
                    throw new CommandRetriableError({
                        ...this.commandErrorParams,
                        message: `Current state of command is ${
                            this.result!.status
                        }`,
                    });
                }
            },
        });

        return this.result!;
    }

    static async execute(
        context: ExecutionContext,
        command: string,
        onStatusUpdate: StatusUpdateListener = () => {},
        cancellationToken?: CancellationToken,
        timeout: Time | undefined = DEFAULT_MAX_TIMEOUT
    ): Promise<CommandWithResult> {
        const cmd = new Command(context);

        cmd.on(Command.statusUpdateEvent, onStatusUpdate);

        const executeApiResponse = await cmd.commandsApi.execute({
            clusterId: cmd.context.cluster.id,
            contextId: cmd.context.id!,
            language: cmd.context.language,
            command,
        });

        cmd.id = executeApiResponse.id;

        const executionResult = await cmd.response(cancellationToken, timeout);

        return {cmd: cmd, result: executionResult};
    }
}
