/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

import {ApiClient} from "../../api-client";
import * as model from "./model";
import Time from "../../retries/Time";
import retry from "../../retries/retries";
import {CancellationToken} from "../../types";
import {ApiError, ApiRetriableError} from "../apiError";
import {context, Context} from "../../context";
import {ExposedLoggers, withLogContext} from "../../logging";

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
    @withLogContext(ExposedLoggers.SDK)
    async cancel(
        request: model.CancelCommand,
        @context context?: Context
    ): Promise<model.CancelResponse> {
        const path = "/api/1.2/commands/cancel";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CancelResponse;
    }

    /**
     * cancel and wait to reach Cancelled state
     *  or fail on reaching Error state
     */
    @withLogContext(ExposedLoggers.SDK)
    async cancelAndWait(
        cancelCommand: model.CancelCommand,
        options?: {
            timeout?: Time;
            onProgress?: (
                newPollResponse: model.CommandStatusResponse
            ) => Promise<void>;
        },
        @context context?: Context
    ): Promise<model.CommandStatusResponse> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        const {timeout, onProgress} = options;
        const cancellationToken = context?.cancellationToken;

        await this.cancel(cancelCommand, context);

        return await retry<model.CommandStatusResponse>({
            timeout,
            fn: async () => {
                const pollResponse = await this.commandStatus(
                    {
                        clusterId: cancelCommand.clusterId!,
                        commandId: cancelCommand.commandId!,
                        contextId: cancelCommand.contextId!,
                    },
                    context
                );
                if (cancellationToken?.isCancellationRequested) {
                    context?.logger?.error(
                        "CommandExecution.cancelAndWait: cancelled"
                    );
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
                        const errorMessage = `failed to reach Cancelled state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `CommandExecution.cancelAndWait: ${errorMessage}`
                        );
                        throw new CommandExecutionError(
                            "cancelAndWait",
                            errorMessage
                        );
                    }
                    default: {
                        const errorMessage = `failed to reach Cancelled state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `CommandExecution.cancelAndWait: retrying: ${errorMessage}`
                        );
                        throw new CommandExecutionRetriableError(
                            "cancelAndWait",
                            errorMessage
                        );
                    }
                }
            },
        });
    }

    /**
     * Get information about a command
     */
    @withLogContext(ExposedLoggers.SDK)
    async commandStatus(
        request: model.CommandStatusRequest,
        @context context?: Context
    ): Promise<model.CommandStatusResponse> {
        const path = "/api/1.2/commands/status";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.CommandStatusResponse;
    }

    /**
     * Get information about an execution context
     */
    @withLogContext(ExposedLoggers.SDK)
    async contextStatus(
        request: model.ContextStatusRequest,
        @context context?: Context
    ): Promise<model.ContextStatusResponse> {
        const path = "/api/1.2/contexts/status";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ContextStatusResponse;
    }

    /**
     * Create an execution context
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateContext,
        @context context?: Context
    ): Promise<model.Created> {
        const path = "/api/1.2/contexts/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.Created;
    }

    /**
     * create and wait to reach Running state
     *  or fail on reaching Error state
     */
    @withLogContext(ExposedLoggers.SDK)
    async createAndWait(
        createContext: model.CreateContext,
        options?: {
            timeout?: Time;
            onProgress?: (
                newPollResponse: model.ContextStatusResponse
            ) => Promise<void>;
        },
        @context context?: Context
    ): Promise<model.ContextStatusResponse> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        const {timeout, onProgress} = options;
        const cancellationToken = context?.cancellationToken;

        const created = await this.create(createContext, context);

        return await retry<model.ContextStatusResponse>({
            timeout,
            fn: async () => {
                const pollResponse = await this.contextStatus(
                    {
                        clusterId: createContext.clusterId!,
                        contextId: created.id!,
                    },
                    context
                );
                if (cancellationToken?.isCancellationRequested) {
                    context?.logger?.error(
                        "CommandExecution.createAndWait: cancelled"
                    );
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
                        const errorMessage = `failed to reach Running state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `CommandExecution.createAndWait: ${errorMessage}`
                        );
                        throw new CommandExecutionError(
                            "createAndWait",
                            errorMessage
                        );
                    }
                    default: {
                        const errorMessage = `failed to reach Running state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `CommandExecution.createAndWait: retrying: ${errorMessage}`
                        );
                        throw new CommandExecutionRetriableError(
                            "createAndWait",
                            errorMessage
                        );
                    }
                }
            },
        });
    }

    /**
     * Delete an execution context
     */
    @withLogContext(ExposedLoggers.SDK)
    async destroy(
        request: model.DestroyContext,
        @context context?: Context
    ): Promise<model.DestroyResponse> {
        const path = "/api/1.2/contexts/destroy";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.DestroyResponse;
    }

    /**
     * Run a command
     */
    @withLogContext(ExposedLoggers.SDK)
    async execute(
        request: model.Command,
        @context context?: Context
    ): Promise<model.Created> {
        const path = "/api/1.2/commands/execute";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.Created;
    }

    /**
     * execute and wait to reach Finished or Error state
     *  or fail on reaching Cancelled or Cancelling state
     */
    @withLogContext(ExposedLoggers.SDK)
    async executeAndWait(
        command: model.Command,
        options?: {
            timeout?: Time;
            onProgress?: (
                newPollResponse: model.CommandStatusResponse
            ) => Promise<void>;
        },
        @context context?: Context
    ): Promise<model.CommandStatusResponse> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        const {timeout, onProgress} = options;
        const cancellationToken = context?.cancellationToken;

        const created = await this.execute(command, context);

        return await retry<model.CommandStatusResponse>({
            timeout,
            fn: async () => {
                const pollResponse = await this.commandStatus(
                    {
                        clusterId: command.clusterId!,
                        commandId: created.id!,
                        contextId: command.contextId!,
                    },
                    context
                );
                if (cancellationToken?.isCancellationRequested) {
                    context?.logger?.error(
                        "CommandExecution.executeAndWait: cancelled"
                    );
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
                        const errorMessage = `failed to reach Finished or Error state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `CommandExecution.executeAndWait: ${errorMessage}`
                        );
                        throw new CommandExecutionError(
                            "executeAndWait",
                            errorMessage
                        );
                    }
                    default: {
                        const errorMessage = `failed to reach Finished or Error state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `CommandExecution.executeAndWait: retrying: ${errorMessage}`
                        );
                        throw new CommandExecutionRetriableError(
                            "executeAndWait",
                            errorMessage
                        );
                    }
                }
            },
        });
    }
}
