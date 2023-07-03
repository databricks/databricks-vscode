/* eslint-disable @typescript-eslint/naming-convention */
// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

/**
 * These APIs allow you to manage Providers, Recipient Activation, Recipients, Shares, etc.
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

import {PermissionsChange} from "../catalog";
import {PermissionsList} from "../catalog";

export class ProvidersRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Providers", method, message);
    }
}
export class ProvidersError extends ApiError {
    constructor(method: string, message?: string) {
        super("Providers", method, message);
    }
}

/**
 * Databricks Providers REST API
 */
export class ProvidersService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.CreateProvider,
        @context context?: Context
    ): Promise<model.ProviderInfo> {
        const path = "/api/2.1/unity-catalog/providers";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.ProviderInfo;
    }

    /**
     * Create an auth provider.
     *
     * Creates a new authentication provider minimally based on a name and
     * authentication type. The caller must be an admin on the metastore.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateProvider,
        @context context?: Context
    ): Promise<model.ProviderInfo> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteProviderRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.1/unity-catalog/providers/${request.name}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a provider.
     *
     * Deletes an authentication provider, if the caller is a metastore admin or
     * is the owner of the provider.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteProviderRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetProviderRequest,
        @context context?: Context
    ): Promise<model.ProviderInfo> {
        const path = `/api/2.1/unity-catalog/providers/${request.name}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ProviderInfo;
    }

    /**
     * Get a provider.
     *
     * Gets a specific authentication provider. The caller must supply the name
     * of the provider, and must either be a metastore admin or the owner of the
     * provider.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetProviderRequest,
        @context context?: Context
    ): Promise<model.ProviderInfo> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: model.ListProvidersRequest,
        @context context?: Context
    ): Promise<model.ListProvidersResponse> {
        const path = "/api/2.1/unity-catalog/providers";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListProvidersResponse;
    }

    /**
     * List providers.
     *
     * Gets an array of available authentication providers. The caller must
     * either be a metastore admin or the owner of the providers. Providers not
     * owned by the caller are not included in the response. There is no
     * guarantee of a specific ordering of the elements in the array.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        request: model.ListProvidersRequest,
        @context context?: Context
    ): AsyncIterable<model.ProviderInfo> {
        const response = (await this._list(request, context)).providers;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _listShares(
        request: model.ListSharesRequest,
        @context context?: Context
    ): Promise<model.ListProviderSharesResponse> {
        const path = `/api/2.1/unity-catalog/providers/${request.name}/shares`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListProviderSharesResponse;
    }

    /**
     * List shares by Provider.
     *
     * Gets an array of a specified provider's shares within the metastore where:
     *
     * * the caller is a metastore admin, or * the caller is the owner.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *listShares(
        request: model.ListSharesRequest,
        @context context?: Context
    ): AsyncIterable<model.ProviderShare> {
        const response = (await this._listShares(request, context)).shares;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: model.UpdateProvider,
        @context context?: Context
    ): Promise<model.ProviderInfo> {
        const path = `/api/2.1/unity-catalog/providers/${request.name}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.ProviderInfo;
    }

    /**
     * Update a provider.
     *
     * Updates the information for an authentication provider, if the caller is a
     * metastore admin or is the owner of the provider. If the update changes the
     * provider name, the caller must be both a metastore admin and the owner of
     * the provider.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateProvider,
        @context context?: Context
    ): Promise<model.ProviderInfo> {
        return await this._update(request, context);
    }
}

export class RecipientActivationRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("RecipientActivation", method, message);
    }
}
export class RecipientActivationError extends ApiError {
    constructor(method: string, message?: string) {
        super("RecipientActivation", method, message);
    }
}

/**
 * Databricks Recipient Activation REST API
 */
export class RecipientActivationService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _getActivationUrlInfo(
        request: model.GetActivationUrlInfoRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.1/unity-catalog/public/data_sharing_activation_info/${request.activation_url}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Get a share activation URL.
     *
     * Gets an activation URL for a share.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getActivationUrlInfo(
        request: model.GetActivationUrlInfoRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._getActivationUrlInfo(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _retrieveToken(
        request: model.RetrieveTokenRequest,
        @context context?: Context
    ): Promise<model.RetrieveTokenResponse> {
        const path = `/api/2.1/unity-catalog/public/data_sharing_activation/${request.activation_url}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.RetrieveTokenResponse;
    }

    /**
     * Get an access token.
     *
     * Retrieve access token with an activation url. This is a public API without
     * any authentication.
     */
    @withLogContext(ExposedLoggers.SDK)
    async retrieveToken(
        request: model.RetrieveTokenRequest,
        @context context?: Context
    ): Promise<model.RetrieveTokenResponse> {
        return await this._retrieveToken(request, context);
    }
}

export class RecipientsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Recipients", method, message);
    }
}
export class RecipientsError extends ApiError {
    constructor(method: string, message?: string) {
        super("Recipients", method, message);
    }
}

/**
 * Databricks Recipients REST API
 */
export class RecipientsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.CreateRecipient,
        @context context?: Context
    ): Promise<model.RecipientInfo> {
        const path = "/api/2.1/unity-catalog/recipients";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.RecipientInfo;
    }

    /**
     * Create a share recipient.
     *
     * Creates a new recipient with the delta sharing authentication type in the
     * metastore. The caller must be a metastore admin or has the
     * **CREATE_RECIPIENT** privilege on the metastore.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateRecipient,
        @context context?: Context
    ): Promise<model.RecipientInfo> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteRecipientRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.1/unity-catalog/recipients/${request.name}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a share recipient.
     *
     * Deletes the specified recipient from the metastore. The caller must be the
     * owner of the recipient.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteRecipientRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetRecipientRequest,
        @context context?: Context
    ): Promise<model.RecipientInfo> {
        const path = `/api/2.1/unity-catalog/recipients/${request.name}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.RecipientInfo;
    }

    /**
     * Get a share recipient.
     *
     * Gets a share recipient from the metastore if:
     *
     * * the caller is the owner of the share recipient, or: * is a metastore
     * admin
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetRecipientRequest,
        @context context?: Context
    ): Promise<model.RecipientInfo> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: model.ListRecipientsRequest,
        @context context?: Context
    ): Promise<model.ListRecipientsResponse> {
        const path = "/api/2.1/unity-catalog/recipients";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListRecipientsResponse;
    }

    /**
     * List share recipients.
     *
     * Gets an array of all share recipients within the current metastore where:
     *
     * * the caller is a metastore admin, or * the caller is the owner. There is
     * no guarantee of a specific ordering of the elements in the array.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        request: model.ListRecipientsRequest,
        @context context?: Context
    ): AsyncIterable<model.RecipientInfo> {
        const response = (await this._list(request, context)).recipients;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _rotateToken(
        request: model.RotateRecipientToken,
        @context context?: Context
    ): Promise<model.RecipientInfo> {
        const path = `/api/2.1/unity-catalog/recipients/${request.name}/rotate-token`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.RecipientInfo;
    }

    /**
     * Rotate a token.
     *
     * Refreshes the specified recipient's delta sharing authentication token
     * with the provided token info. The caller must be the owner of the
     * recipient.
     */
    @withLogContext(ExposedLoggers.SDK)
    async rotateToken(
        request: model.RotateRecipientToken,
        @context context?: Context
    ): Promise<model.RecipientInfo> {
        return await this._rotateToken(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _sharePermissions(
        request: model.SharePermissionsRequest,
        @context context?: Context
    ): Promise<model.GetRecipientSharePermissionsResponse> {
        const path = `/api/2.1/unity-catalog/recipients/${request.name}/share-permissions`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetRecipientSharePermissionsResponse;
    }

    /**
     * Get recipient share permissions.
     *
     * Gets the share permissions for the specified Recipient. The caller must be
     * a metastore admin or the owner of the Recipient.
     */
    @withLogContext(ExposedLoggers.SDK)
    async sharePermissions(
        request: model.SharePermissionsRequest,
        @context context?: Context
    ): Promise<model.GetRecipientSharePermissionsResponse> {
        return await this._sharePermissions(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: model.UpdateRecipient,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.1/unity-catalog/recipients/${request.name}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Update a share recipient.
     *
     * Updates an existing recipient in the metastore. The caller must be a
     * metastore admin or the owner of the recipient. If the recipient name will
     * be updated, the user must be both a metastore admin and the owner of the
     * recipient.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateRecipient,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._update(request, context);
    }
}

export class SharesRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Shares", method, message);
    }
}
export class SharesError extends ApiError {
    constructor(method: string, message?: string) {
        super("Shares", method, message);
    }
}

/**
 * Databricks Shares REST API
 */
export class SharesService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.CreateShare,
        @context context?: Context
    ): Promise<model.ShareInfo> {
        const path = "/api/2.1/unity-catalog/shares";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.ShareInfo;
    }

    /**
     * Create a share.
     *
     * Creates a new share for data objects. Data objects can be added after
     * creation with **update**. The caller must be a metastore admin or have the
     * **CREATE_SHARE** privilege on the metastore.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateShare,
        @context context?: Context
    ): Promise<model.ShareInfo> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteShareRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.1/unity-catalog/shares/${request.name}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a share.
     *
     * Deletes a data object share from the metastore. The caller must be an
     * owner of the share.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteShareRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetShareRequest,
        @context context?: Context
    ): Promise<model.ShareInfo> {
        const path = `/api/2.1/unity-catalog/shares/${request.name}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ShareInfo;
    }

    /**
     * Get a share.
     *
     * Gets a data object share from the metastore. The caller must be a
     * metastore admin or the owner of the share.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetShareRequest,
        @context context?: Context
    ): Promise<model.ShareInfo> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        @context context?: Context
    ): Promise<model.ListSharesResponse> {
        const path = "/api/2.1/unity-catalog/shares";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.ListSharesResponse;
    }

    /**
     * List shares.
     *
     * Gets an array of data object shares from the metastore. The caller must be
     * a metastore admin or the owner of the share. There is no guarantee of a
     * specific ordering of the elements in the array.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(@context context?: Context): AsyncIterable<model.ShareInfo> {
        const response = (await this._list(context)).shares;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _sharePermissions(
        request: model.SharePermissionsRequest,
        @context context?: Context
    ): Promise<model.PermissionsList> {
        const path = `/api/2.1/unity-catalog/shares/${request.name}/permissions`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as PermissionsList;
    }

    /**
     * Get permissions.
     *
     * Gets the permissions for a data share from the metastore. The caller must
     * be a metastore admin or the owner of the share.
     */
    @withLogContext(ExposedLoggers.SDK)
    async sharePermissions(
        request: model.SharePermissionsRequest,
        @context context?: Context
    ): Promise<model.PermissionsList> {
        return await this._sharePermissions(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: model.UpdateShare,
        @context context?: Context
    ): Promise<model.ShareInfo> {
        const path = `/api/2.1/unity-catalog/shares/${request.name}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.ShareInfo;
    }

    /**
     * Update a share.
     *
     * Updates the share with the changes and data objects in the request. The
     * caller must be the owner of the share or a metastore admin.
     *
     * When the caller is a metastore admin, only the __owner__ field can be
     * updated.
     *
     * In the case that the share name is changed, **updateShare** requires that
     * the caller is both the share owner and a metastore admin.
     *
     * For each table that is added through this method, the share owner must
     * also have **SELECT** privilege on the table. This privilege must be
     * maintained indefinitely for recipients to be able to access the table.
     * Typically, you should use a group as the share owner.
     *
     * Table removals through **update** do not require additional privileges.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateShare,
        @context context?: Context
    ): Promise<model.ShareInfo> {
        return await this._update(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _updatePermissions(
        request: model.UpdateSharePermissions,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.1/unity-catalog/shares/${request.name}/permissions`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Update permissions.
     *
     * Updates the permissions for a data share in the metastore. The caller must
     * be a metastore admin or an owner of the share.
     *
     * For new recipient grants, the user must also be the owner of the
     * recipients. recipient revocations do not require additional privileges.
     */
    @withLogContext(ExposedLoggers.SDK)
    async updatePermissions(
        request: model.UpdateSharePermissions,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._updatePermissions(request, context);
    }
}
