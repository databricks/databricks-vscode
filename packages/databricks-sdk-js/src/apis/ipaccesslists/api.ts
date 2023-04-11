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

export class IpAccessListsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("IpAccessLists", method, message);
    }
}
export class IpAccessListsError extends ApiError {
    constructor(method: string, message?: string) {
        super("IpAccessLists", method, message);
    }
}

/**
 * IP Access List enables admins to configure IP access lists.
 *
 * IP access lists affect web application access and REST API access to this
 * workspace only. If the feature is disabled for a workspace, all access is
 * allowed for this workspace. There is support for allow lists (inclusion) and
 * block lists (exclusion).
 *
 * When a connection is attempted: 1. **First, all block lists are checked.** If
 * the connection IP address matches any block list, the connection is rejected.
 * 2. **If the connection was not rejected by block lists**, the IP address is
 * compared with the allow lists.
 *
 * If there is at least one allow list for the workspace, the connection is
 * allowed only if the IP address matches an allow list. If there are no allow
 * lists for the workspace, all IP addresses are allowed.
 *
 * For all allow lists and block lists combined, the workspace supports a maximum
 * of 1000 IP/CIDR values, where one CIDR counts as a single value.
 *
 * After changes to the IP access list feature, it can take a few minutes for
 * changes to take effect.
 */
export class IpAccessListsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.CreateIpAccessList,
        @context context?: Context
    ): Promise<model.CreateIpAccessListResponse> {
        const path = "/api/2.0/ip-access-lists";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreateIpAccessListResponse;
    }

    /**
     * Create access list.
     *
     * Creates an IP access list for this workspace.
     *
     * A list can be an allow list or a block list. See the top of this file for
     * a description of how the server treats allow lists and block lists at
     * runtime.
     *
     * When creating or updating an IP access list:
     *
     * * For all allow lists and block lists combined, the API supports a maximum
     * of 1000 IP/CIDR values, where one CIDR counts as a single value. Attempts
     * to exceed that number return error 400 with `error_code` value
     * `QUOTA_EXCEEDED`. * If the new list would block the calling user's current
     * IP, error 400 is returned with `error_code` value `INVALID_STATE`.
     *
     * It can take a few minutes for the changes to take effect. **Note**: Your
     * new IP access list has no effect until you enable the feature. See
     * :method:workspaceconf/setStatus
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateIpAccessList,
        @context context?: Context
    ): Promise<model.CreateIpAccessListResponse> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.Delete,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/ip-access-lists/${request.ip_access_list_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete access list.
     *
     * Deletes an IP access list, specified by its list ID.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.Delete,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.Get,
        @context context?: Context
    ): Promise<model.FetchIpAccessListResponse> {
        const path = `/api/2.0/ip-access-lists/${request.ip_access_list_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.FetchIpAccessListResponse;
    }

    /**
     * Get access list.
     *
     * Gets an IP access list, specified by its list ID.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.Get,
        @context context?: Context
    ): Promise<model.FetchIpAccessListResponse> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        @context context?: Context
    ): Promise<model.GetIpAccessListResponse> {
        const path = "/api/2.0/ip-access-lists";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.GetIpAccessListResponse;
    }

    /**
     * Get access lists.
     *
     * Gets all IP access lists for the specified workspace.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        @context context?: Context
    ): AsyncIterable<model.IpAccessListInfo> {
        const response = (await this._list(context)).ip_access_lists;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _replace(
        request: model.ReplaceIpAccessList,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/ip-access-lists/${request.ip_access_list_id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Replace access list.
     *
     * Replaces an IP access list, specified by its ID.
     *
     * A list can include allow lists and block lists. See the top of this file
     * for a description of how the server treats allow lists and block lists at
     * run time. When replacing an IP access list: * For all allow lists and
     * block lists combined, the API supports a maximum of 1000 IP/CIDR values,
     * where one CIDR counts as a single value. Attempts to exceed that number
     * return error 400 with `error_code` value `QUOTA_EXCEEDED`. * If the
     * resulting list would block the calling user's current IP, error 400 is
     * returned with `error_code` value `INVALID_STATE`. It can take a few
     * minutes for the changes to take effect. Note that your resulting IP access
     * list has no effect until you enable the feature. See
     * :method:workspaceconf/setStatus.
     */
    @withLogContext(ExposedLoggers.SDK)
    async replace(
        request: model.ReplaceIpAccessList,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._replace(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: model.UpdateIpAccessList,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/ip-access-lists/${request.ip_access_list_id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Update access list.
     *
     * Updates an existing IP access list, specified by its ID.
     *
     * A list can include allow lists and block lists. See the top of this file
     * for a description of how the server treats allow lists and block lists at
     * run time.
     *
     * When updating an IP access list:
     *
     * * For all allow lists and block lists combined, the API supports a maximum
     * of 1000 IP/CIDR values, where one CIDR counts as a single value. Attempts
     * to exceed that number return error 400 with `error_code` value
     * `QUOTA_EXCEEDED`. * If the updated list would block the calling user's
     * current IP, error 400 is returned with `error_code` value `INVALID_STATE`.
     *
     * It can take a few minutes for the changes to take effect. Note that your
     * resulting IP access list has no effect until you enable the feature. See
     * :method:workspaceconf/setStatus.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateIpAccessList,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._update(request, context);
    }
}
