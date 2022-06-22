import {ApiClient} from "../api-client";
import {Language} from "./executionContext";

export interface CommandsExecuteRequest {
    clusterId: string;
    contextId: string;
    language: Language;
    command: string;
}

export interface CommandsExecuteResponse {
    id: string;
}

export interface CommandsStatusRequest {
    clusterId: string;
    contextId: string;
    commandId: string;
}

export interface CommandsStatusResponse {
    id: string;
    status:
        | "Cancelled"
        | "Cancelling"
        | "Error"
        | "Finished"
        | "Queued"
        | "Running";
    results?:
        | {
              resultType: "error";
              cause: string;
              summary: string;
          }
        | {
              resultType: "image";
              fileName: string;
          }
        | {
              resultType: "images";
              fileNames: string[];
          }
        | {
              resultType: "table";
              data: any[][];
              schema: any;
              truncated: boolean;
              isJsonSchema: boolean;
          }
        | {
              resultType: "text";
              data: string;
          };
}

export interface CommandsCancelRequest {
    clusterId: string;
    contextId: string;
    commandId: string;
}

export interface CommandsCancelResponse {
    id: string;
}

export class CommandsApi {
    readonly client: ApiClient;

    constructor(client: ApiClient) {
        this.client = client;
    }

    async execute(
        req: CommandsExecuteRequest
    ): Promise<CommandsExecuteResponse> {
        return (await this.client.request(
            "/api/1.2/commands/execute",
            "POST",
            req
        )) as CommandsExecuteResponse;
    }

    async status(req: CommandsStatusRequest): Promise<CommandsStatusResponse> {
        return (await this.client.request(
            "/api/1.2/commands/status",
            "GET",
            req
        )) as CommandsStatusResponse;
    }

    async cancel(req: CommandsCancelRequest): Promise<CommandsCancelResponse> {
        return (await this.client.request(
            "/api/1.2/commands/cancel",
            "POST",
            req
        )) as CommandsCancelResponse;
    }
}
