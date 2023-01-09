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

export class GlobalInitScriptsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("GlobalInitScripts", method, message);
    }
}
export class GlobalInitScriptsError extends ApiError {
    constructor(method: string, message?: string) {
        super("GlobalInitScripts", method, message);
    }
}

/**
 * The Global Init Scripts API enables Workspace administrators to configure
 * global initialization scripts for their workspace. These scripts run on every
 * node in every cluster in the workspace.
 *
 * **Important:** Existing clusters must be restarted to pick up any changes made
 * to global init scripts. Global init scripts are run in order. If the init
 * script returns with a bad exit code, the Apache Spark container fails to
 * launch and init scripts with later position are skipped. If enough containers
 * fail, the entire cluster fails with a `GLOBAL_INIT_SCRIPT_FAILURE` error code.
 */
export class GlobalInitScriptsService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create init script.
     *
     * Creates a new global init script in this workspace.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.GlobalInitScriptCreateRequest,
        @context context?: Context
    ): Promise<model.CreateResponse> {
        const path = "/api/2.0/global-init-scripts";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreateResponse;
    }

    /**
     * Delete init script.
     *
     * Deletes a global init script.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.Delete,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/global-init-scripts/${request.script_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Get an init script.
     *
     * Gets all the details of a script, including its Base64-encoded contents.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.Get,
        @context context?: Context
    ): Promise<model.GlobalInitScriptDetailsWithContent> {
        const path = `/api/2.0/global-init-scripts/${request.script_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GlobalInitScriptDetailsWithContent;
    }

    /**
     * Get init scripts.
     *
     * "Get a list of all global init scripts for this workspace. This returns
     * all properties for each script but **not** the script contents. To
     * retrieve the contents of a script, use the [get a global init
     * script](#operation/get-script) operation.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        @context context?: Context
    ): Promise<model.ListGlobalInitScriptsResponse> {
        const path = "/api/2.0/global-init-scripts";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.ListGlobalInitScriptsResponse;
    }

    /**
     * Update init script.
     *
     * Updates a global init script, specifying only the fields to change. All
     * fields are optional. Unspecified fields retain their current value.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.GlobalInitScriptUpdateRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/global-init-scripts/${request.script_id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
    }
}
