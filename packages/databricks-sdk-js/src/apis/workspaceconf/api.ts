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

export class WorkspaceConfRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("WorkspaceConf", method, message);
    }
}
export class WorkspaceConfError extends ApiError {
    constructor(method: string, message?: string) {
        super("WorkspaceConf", method, message);
    }
}

/**

*/
export class WorkspaceConfService {
    constructor(readonly client: ApiClient) {}
    /**
     * Check configuration status
     *
     * Gets the configuration status for a workspace.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getStatus(
        request: model.GetStatusRequest,
        @context context?: Context
    ): Promise<model.WorkspaceConf> {
        const path = "/api/2.0/workspace-conf";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.WorkspaceConf;
    }

    /**
     * Enable/disable features
     *
     * Sets the configuration status for a workspace, including enabling or
     * disabling it.
     */
    @withLogContext(ExposedLoggers.SDK)
    async setStatus(
        request: model.WorkspaceConf,
        @context context?: Context
    ): Promise<model.SetStatusResponse> {
        const path = "/api/2.0/workspace-conf";
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.SetStatusResponse;
    }
}
