/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

import {ApiClient} from "../../api-client";
import * as model from "./model";
import Time from "../../retries/Time";
import retry from "../../retries/retries";
import {CancellationToken} from "../../types";
import {ApiError, ApiRetriableError} from "../apiError";

export class CommandExecutionRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("CommandExecution", method, message);
    }
}
export class CommandExecutionError extends ApiError {
    constructor(method: string, message?: string) {
        super("CommandExecution", method, message);
    }
}

/**

*/
export class CommandExecutionService {
    constructor(readonly client: ApiClient) {}
    /**
     * Cancel a command
     */
    async cancel(
        request: model.CancelCommand,
        cancellationToken?: CancellationToken
    ): Promise<model.CancelResponse> {
        const path = "/api/1.2/commands/cancel";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.CancelResponse;
    }

    /**
     * cancel and wait to reach Cancelled state
     *  or fail on reaching Error state
     */
    async cancelAndWait(
        cancelCommand: model.CancelCommand,
        options?: {
            timeout?: Time;
            cancellationToken?: CancellationToken;
            onProgress?: (
                newPollResponse: model.CommandStatusResponse
            ) => Promise<void>;
        }
    ): Promise<model.CommandStatusResponse> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        let {cancellationToken, timeout, onProgress} = options;

        await this.cancel(cancelCommand);

        return await retry<model.CommandStatusResponse>({
            timeout,
            fn: async () => {
                const pollResponse = await this.commandStatus(
                    {
                        clusterId: cancelCommand.clusterId!,
                        commandId: cancelCommand.commandId!,
                        contextId: cancelCommand.contextId!,
                    },
                    cancellationToken
                );
                if (cancellationToken?.isCancellationRequested) {
                    throw new CommandExecutionError(
                        "cancelAndWait",
                        "cancelled"
                    );
                }
                await onProgress(pollResponse);
                const status = pollResponse.status;
                const statusMessage = pollResponse.results!.cause;
                switch (status) {
                    case "Cancelled": {
                        return pollResponse;
                    }
                    case "Error": {
                        throw new CommandExecutionError(
                            "cancelAndWait",
                            `failed to reach Cancelled state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new CommandExecutionRetriableError(
                            "cancelAndWait",
                            `failed to reach Cancelled state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    /**
     * Get information about a command
     */
    async commandStatus(
        request: model.CommandStatusRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.CommandStatusResponse> {
        const path = "/api/1.2/commands/status";
        return (await this.client.request(
            path,
            "GET",
            request,
            cancellationToken
        )) as model.CommandStatusResponse;
    }

    /**
     * Get information about an execution context
     */
    async contextStatus(
        request: model.ContextStatusRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.ContextStatusResponse> {
        const path = "/api/1.2/contexts/status";
        return (await this.client.request(
            path,
            "GET",
            request,
            cancellationToken
        )) as model.ContextStatusResponse;
    }

    /**
     * Create an execution context
     */
    async create(
        request: model.CreateContext,
        cancellationToken?: CancellationToken
    ): Promise<model.Created> {
        const path = "/api/1.2/contexts/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.Created;
    }

    /**
     * create and wait to reach Running state
     *  or fail on reaching Error state
     */
    async createAndWait(
        createContext: model.CreateContext,
        options?: {
            timeout?: Time;
            cancellationToken?: CancellationToken;
            onProgress?: (
                newPollResponse: model.ContextStatusResponse
            ) => Promise<void>;
        }
    ): Promise<model.ContextStatusResponse> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        let {cancellationToken, timeout, onProgress} = options;

        const created = await this.create(createContext);

        return await retry<model.ContextStatusResponse>({
            timeout,
            fn: async () => {
                const pollResponse = await this.contextStatus(
                    {
                        clusterId: createContext.clusterId!,
                        contextId: created.id!,
                    },
                    cancellationToken
                );
                if (cancellationToken?.isCancellationRequested) {
                    throw new CommandExecutionError(
                        "createAndWait",
                        "cancelled"
                    );
                }
                await onProgress(pollResponse);
                const status = pollResponse.status;
                const statusMessage = pollResponse;
                switch (status) {
                    case "Running": {
                        return pollResponse;
                    }
                    case "Error": {
                        throw new CommandExecutionError(
                            "createAndWait",
                            `failed to reach Running state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new CommandExecutionRetriableError(
                            "createAndWait",
                            `failed to reach Running state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    /**
     * Delete an execution context
     */
    async destroy(
        request: model.DestroyContext,
        cancellationToken?: CancellationToken
    ): Promise<model.DestroyResponse> {
        const path = "/api/1.2/contexts/destroy";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.DestroyResponse;
    }

    /**
     * Run a command
     */
    async execute(
        request: model.Command,
        cancellationToken?: CancellationToken
    ): Promise<model.Created> {
        const path = "/api/1.2/commands/execute";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.Created;
    }

    /**
     * execute and wait to reach Finished or Error state
     *  or fail on reaching Cancelled or Cancelling state
     */
    async executeAndWait(
        command: model.Command,
        options?: {
            timeout?: Time;
            cancellationToken?: CancellationToken;
            onProgress?: (
                newPollResponse: model.CommandStatusResponse
            ) => Promise<void>;
        }
    ): Promise<model.CommandStatusResponse> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        let {cancellationToken, timeout, onProgress} = options;

        const created = await this.execute(command);

        return await retry<model.CommandStatusResponse>({
            timeout,
            fn: async () => {
                const pollResponse = await this.commandStatus(
                    {
                        clusterId: command.clusterId!,
                        commandId: created.id!,
                        contextId: command.contextId!,
                    },
                    cancellationToken
                );
                if (cancellationToken?.isCancellationRequested) {
                    throw new CommandExecutionError(
                        "executeAndWait",
                        "cancelled"
                    );
                }
                await onProgress(pollResponse);
                const status = pollResponse.status;
                const statusMessage = pollResponse;
                switch (status) {
                    case "Finished":
                    case "Error": {
                        return pollResponse;
                    }
                    case "Cancelled":
                    case "Cancelling": {
                        throw new CommandExecutionError(
                            "executeAndWait",
                            `failed to reach Finished or Error state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new CommandExecutionRetriableError(
                            "executeAndWait",
                            `failed to reach Finished or Error state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }
}
