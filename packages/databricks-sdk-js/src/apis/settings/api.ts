/* eslint-disable @typescript-eslint/naming-convention */
// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

/**
 * These APIs allow you to manage Account Ip Access Lists, Account Settings, Ip Access Lists, Token Management, Tokens, Workspace Conf, etc.
 */

import {ApiClient} from "../../api-client";
import * as model from "./model";
import Time from "../../retries/Time";
import retry from "../../retries/retries";
import {CancellationToken} from "../../types";
import {ApiError, ApiRetriableError} from "../apiError";
import {context, Context} from "../../context";
import {ExposedLoggers, withLogContext} from "../../logging";
import {Waiter, asWaiter} from "../../wait";

export class AccountIpAccessListsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("AccountIpAccessLists", method, message);
    }
}
export class AccountIpAccessListsError extends ApiError {
    constructor(method: string, message?: string) {
        super("AccountIpAccessLists", method, message);
    }
}

/**
 * The Accounts IP Access List API enables account admins to configure IP access
 * lists for access to the account console.
 *
 * Account IP Access Lists affect web application access and REST API access to
 * the account console and account APIs. If the feature is disabled for the
 * account, all access is allowed for this account. There is support for allow
 * lists (inclusion) and block lists (exclusion).
 *
 * When a connection is attempted: 1. **First, all block lists are checked.** If
 * the connection IP address matches any block list, the connection is rejected.
 * 2. **If the connection was not rejected by block lists**, the IP address is
 * compared with the allow lists.
 *
 * If there is at least one allow list for the account, the connection is allowed
 * only if the IP address matches an allow list. If there are no allow lists for
 * the account, all IP addresses are allowed.
 *
 * For all allow lists and block lists combined, the account supports a maximum
 * of 1000 IP/CIDR values, where one CIDR counts as a single value.
 *
 * After changes to the account-level IP access lists, it can take a few minutes
 * for changes to take effect.
 */
export class AccountIpAccessListsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.CreateIpAccessList,
        @context context?: Context
    ): Promise<model.CreateIpAccessListResponse> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/preview/accounts/${config.accountId}/ip-access-lists`;
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
     * Creates an IP access list for the account.
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
     * It can take a few minutes for the changes to take effect.
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
        request: model.DeleteAccountIpAccessListRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/preview/accounts/${config.accountId}/ip-access-lists/${request.ip_access_list_id}`;
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
        request: model.DeleteAccountIpAccessListRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetAccountIpAccessListRequest,
        @context context?: Context
    ): Promise<model.GetIpAccessListResponse> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/preview/accounts/${config.accountId}/ip-access-lists/${request.ip_access_list_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetIpAccessListResponse;
    }

    /**
     * Get IP access list.
     *
     * Gets an IP access list, specified by its list ID.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetAccountIpAccessListRequest,
        @context context?: Context
    ): Promise<model.GetIpAccessListResponse> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        @context context?: Context
    ): Promise<model.GetIpAccessListsResponse> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/preview/accounts/${config.accountId}/ip-access-lists`;
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.GetIpAccessListsResponse;
    }

    /**
     * Get access lists.
     *
     * Gets all IP access lists for the specified account.
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
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/preview/accounts/${config.accountId}/ip-access-lists/${request.ip_access_list_id}`;
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
     * minutes for the changes to take effect.
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
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/preview/accounts/${config.accountId}/ip-access-lists/${request.ip_access_list_id}`;
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
     * It can take a few minutes for the changes to take effect.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateIpAccessList,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._update(request, context);
    }
}

export class AccountSettingsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("AccountSettings", method, message);
    }
}
export class AccountSettingsError extends ApiError {
    constructor(method: string, message?: string) {
        super("AccountSettings", method, message);
    }
}

/**
 * TBD
 */
export class AccountSettingsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _deletePersonalComputeSetting(
        request: model.DeletePersonalComputeSettingRequest,
        @context context?: Context
    ): Promise<model.DeletePersonalComputeSettingResponse> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/settings/types/dcp_acct_enable/names/default`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.DeletePersonalComputeSettingResponse;
    }

    /**
     * Delete Personal Compute setting.
     *
     * TBD
     */
    @withLogContext(ExposedLoggers.SDK)
    async deletePersonalComputeSetting(
        request: model.DeletePersonalComputeSettingRequest,
        @context context?: Context
    ): Promise<model.DeletePersonalComputeSettingResponse> {
        return await this._deletePersonalComputeSetting(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _readPersonalComputeSetting(
        request: model.ReadPersonalComputeSettingRequest,
        @context context?: Context
    ): Promise<model.PersonalComputeSetting> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/settings/types/dcp_acct_enable/names/default`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.PersonalComputeSetting;
    }

    /**
     * Get Personal Compute setting.
     *
     * TBD
     */
    @withLogContext(ExposedLoggers.SDK)
    async readPersonalComputeSetting(
        request: model.ReadPersonalComputeSettingRequest,
        @context context?: Context
    ): Promise<model.PersonalComputeSetting> {
        return await this._readPersonalComputeSetting(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _updatePersonalComputeSetting(
        request: model.UpdatePersonalComputeSettingRequest,
        @context context?: Context
    ): Promise<model.PersonalComputeSetting> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/settings/types/dcp_acct_enable/names/default`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.PersonalComputeSetting;
    }

    /**
     * Update Personal Compute setting.
     *
     * TBD
     */
    @withLogContext(ExposedLoggers.SDK)
    async updatePersonalComputeSetting(
        request: model.UpdatePersonalComputeSettingRequest,
        @context context?: Context
    ): Promise<model.PersonalComputeSetting> {
        return await this._updatePersonalComputeSetting(request, context);
    }
}

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
        request: model.DeleteIpAccessListRequest,
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
        request: model.DeleteIpAccessListRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetIpAccessListRequest,
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
        request: model.GetIpAccessListRequest,
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

export class TokenManagementRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("TokenManagement", method, message);
    }
}
export class TokenManagementError extends ApiError {
    constructor(method: string, message?: string) {
        super("TokenManagement", method, message);
    }
}

/**
 * Enables administrators to get all tokens and delete tokens for other users.
 * Admins can either get every token, get a specific token by ID, or get all
 * tokens for a particular user.
 */
export class TokenManagementService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _createOboToken(
        request: model.CreateOboTokenRequest,
        @context context?: Context
    ): Promise<model.CreateOboTokenResponse> {
        const path = "/api/2.0/token-management/on-behalf-of/tokens";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreateOboTokenResponse;
    }

    /**
     * Create on-behalf token.
     *
     * Creates a token on behalf of a service principal.
     */
    @withLogContext(ExposedLoggers.SDK)
    async createOboToken(
        request: model.CreateOboTokenRequest,
        @context context?: Context
    ): Promise<model.CreateOboTokenResponse> {
        return await this._createOboToken(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteTokenManagementRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/token-management/tokens/${request.token_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a token.
     *
     * Deletes a token, specified by its ID.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteTokenManagementRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetTokenManagementRequest,
        @context context?: Context
    ): Promise<model.TokenInfo> {
        const path = `/api/2.0/token-management/tokens/${request.token_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.TokenInfo;
    }

    /**
     * Get token info.
     *
     * Gets information about a token, specified by its ID.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetTokenManagementRequest,
        @context context?: Context
    ): Promise<model.TokenInfo> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: model.ListTokenManagementRequest,
        @context context?: Context
    ): Promise<model.ListTokensResponse> {
        const path = "/api/2.0/token-management/tokens";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListTokensResponse;
    }

    /**
     * List all tokens.
     *
     * Lists all tokens associated with the specified workspace or user.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        request: model.ListTokenManagementRequest,
        @context context?: Context
    ): AsyncIterable<model.TokenInfo> {
        const response = (await this._list(request, context)).token_infos;
        for (const v of response || []) {
            yield v;
        }
    }
}

export class TokensRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Tokens", method, message);
    }
}
export class TokensError extends ApiError {
    constructor(method: string, message?: string) {
        super("Tokens", method, message);
    }
}

/**
 * The Token API allows you to create, list, and revoke tokens that can be used
 * to authenticate and access Databricks REST APIs.
 */
export class TokensService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.CreateTokenRequest,
        @context context?: Context
    ): Promise<model.CreateTokenResponse> {
        const path = "/api/2.0/token/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreateTokenResponse;
    }

    /**
     * Create a user token.
     *
     * Creates and returns a token for a user. If this call is made through token
     * authentication, it creates a token with the same client ID as the
     * authenticated token. If the user's token quota is exceeded, this call
     * returns an error **QUOTA_EXCEEDED**.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateTokenRequest,
        @context context?: Context
    ): Promise<model.CreateTokenResponse> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.RevokeTokenRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/token/delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Revoke token.
     *
     * Revokes an access token.
     *
     * If a token with the specified ID is not valid, this call returns an error
     * **RESOURCE_DOES_NOT_EXIST**.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.RevokeTokenRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        @context context?: Context
    ): Promise<model.ListTokensResponse> {
        const path = "/api/2.0/token/list";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.ListTokensResponse;
    }

    /**
     * List tokens.
     *
     * Lists all the valid tokens for a user-workspace pair.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(@context context?: Context): AsyncIterable<model.TokenInfo> {
        const response = (await this._list(context)).token_infos;
        for (const v of response || []) {
            yield v;
        }
    }
}

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
 * This API allows updating known workspace settings for advanced users.
 */
export class WorkspaceConfService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _getStatus(
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
     * Check configuration status.
     *
     * Gets the configuration status for a workspace.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getStatus(
        request: model.GetStatusRequest,
        @context context?: Context
    ): Promise<model.WorkspaceConf> {
        return await this._getStatus(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _setStatus(
        request: model.WorkspaceConf,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/workspace-conf";
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Enable/disable features.
     *
     * Sets the configuration status for a workspace, including enabling or
     * disabling it.
     */
    @withLogContext(ExposedLoggers.SDK)
    async setStatus(
        request: model.WorkspaceConf,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._setStatus(request, context);
    }
}
