/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

import {ApiClient} from "../../api-client";
import * as model from "./model";
import Time from "../../retries/Time";
import retry from "../../retries/retries";
import {CancellationToken} from "../../types";
import {ApiError, ApiRetriableError} from "../apiError";

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
    async getStatus(
        request: model.GetStatusRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.WorkspaceConf> {
        const path = "/api/2.0/workspace-conf";
        return (await this.client.request(
            path,
            "GET",
            request,
            cancellationToken
        )) as model.WorkspaceConf;
    }

    /**
     * Enable/disable features
     *
     * Sets the configuration status for a workspace, including enabling or
     * disabling it.
     */
    async setStatus(
        request: model.WorkspaceConf,
        cancellationToken?: CancellationToken
    ): Promise<model.SetStatusResponse> {
        const path = "/api/2.0/workspace-conf";
        return (await this.client.request(
            path,
            "PATCH",
            request,
            cancellationToken
        )) as model.SetStatusResponse;
    }
}
