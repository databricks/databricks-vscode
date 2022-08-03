import EventEmitter from "node:events";
import {CommandsService, CommandsStatusResponse} from "../apis/commands";
import {ExecutionContext} from "./ExecutionContext";

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

    async response(): Promise<CommandsStatusResponse> {
        while (true) {
            let result = await this.commandsApi.status({
                clusterId: this.context.cluster.id,
                contextId: this.context.id!,
                commandId: this.id!,
            });

            this.emit(Command.statusUpdateEvent, result);

            if (
                result.status === "Cancelled" ||
                result.status === "Error" ||
                result.status === "Finished"
            ) {
                return result;
            }

            await new Promise((resolve) => {
                setTimeout(resolve, 1000);
            });
        }
    }

    static async execute(
        context: ExecutionContext,
        command: string,
        onStatusUpdate: StatusUpdateListener = () => {}
    ): Promise<CommandWithResult> {
        //console.log(`Executing (${language}): ${command}`);
        let cmd = new Command(context);

        cmd.on(Command.statusUpdateEvent, onStatusUpdate);

        let result = await cmd.commandsApi.execute({
            clusterId: cmd.context.cluster.id,
            contextId: cmd.context.id!,
            language: cmd.context.language,
            command,
        });

        cmd.id = result.id;
        const executionResult = await cmd.response();

        return {cmd: cmd, result: executionResult};
    }
}
