import EventEmitter = require("node:events");
import {CommandsApi, CommandsStatusResponse} from "../apis/commands";
import {Language} from "../apis/executionContext";
import {ExecutionContext} from "./ExecutionContext";

export class Command extends EventEmitter {
    readonly context: ExecutionContext;
    readonly commandsApi: CommandsApi;
    id?: string;

    constructor(context: ExecutionContext) {
        super();
        this.context = context;
        this.commandsApi = new CommandsApi(context.client);
    }

    async response(): Promise<CommandsStatusResponse> {
        while (true) {
            let result = await this.commandsApi.status({
                clusterId: this.context.clusterId,
                contextId: this.context.id!,
                commandId: this.id!,
            });

            this.emit("statusUpdate", result);

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
        language: Language = "python"
    ): Promise<Command> {
        //console.log(`Executing (${language}): ${command}`);
        let cmd = new Command(context);

        let result = await cmd.commandsApi.execute({
            clusterId: cmd.context.clusterId,
            contextId: cmd.context.id!,
            language,
            command,
        });

        cmd.id = result.id;
        return cmd;
    }
}
