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
import {Waiter, asWaiter} from "../../wait";

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
 * This API allows execution of Python, Scala, SQL, or R commands on running
 * Databricks Clusters.
 */
export class CommandExecutionService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _cancel(
        request: model.CancelCommand,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/1.2/commands/cancel";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Cancel a command.
     *
     * Cancels a currently running command within an execution context.
     *
     * The command ID is obtained from a prior successful call to __execute__.
     */
    @withLogContext(ExposedLoggers.SDK)
    async cancel(
        cancelCommand: model.CancelCommand,
        @context context?: Context
    ): Promise<Waiter<model.EmptyResponse, model.CommandStatusResponse>> {
        const cancellationToken = context?.cancellationToken;

        await this._cancel(cancelCommand, context);

        return asWaiter(null, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

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
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _commandStatus(
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
     * Get command info.
     *
     * Gets the status of and, if available, the results from a currently
     * executing command.
     *
     * The command ID is obtained from a prior successful call to __execute__.
     */
    @withLogContext(ExposedLoggers.SDK)
    async commandStatus(
        request: model.CommandStatusRequest,
        @context context?: Context
    ): Promise<model.CommandStatusResponse> {
        return await this._commandStatus(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _contextStatus(
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
     * Get status.
     *
     * Gets the status for an execution context.
     */
    @withLogContext(ExposedLoggers.SDK)
    async contextStatus(
        request: model.ContextStatusRequest,
        @context context?: Context
    ): Promise<model.ContextStatusResponse> {
        return await this._contextStatus(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
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
     * Create an execution context.
     *
     * Creates an execution context for running cluster commands.
     *
     * If successful, this method returns the ID of the new execution context.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        createContext: model.CreateContext,
        @context context?: Context
    ): Promise<Waiter<model.Created, model.ContextStatusResponse>> {
        const cancellationToken = context?.cancellationToken;

        const created = await this._create(createContext, context);

        return asWaiter(created, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

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
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _destroy(
        request: model.DestroyContext,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/1.2/contexts/destroy";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete an execution context.
     *
     * Deletes an execution context.
     */
    @withLogContext(ExposedLoggers.SDK)
    async destroy(
        request: model.DestroyContext,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._destroy(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _execute(
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
     * Run a command.
     *
     * Runs a cluster command in the given execution context, using the provided
     * language.
     *
     * If successful, it returns an ID for tracking the status of the command's
     * execution.
     */
    @withLogContext(ExposedLoggers.SDK)
    async execute(
        command: model.Command,
        @context context?: Context
    ): Promise<Waiter<model.Created, model.CommandStatusResponse>> {
        const cancellationToken = context?.cancellationToken;

        const created = await this._execute(command, context);

        return asWaiter(created, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

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
        });
    }
}
