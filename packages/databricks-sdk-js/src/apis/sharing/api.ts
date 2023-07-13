/* eslint-disable @typescript-eslint/naming-convention */
// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

/**
 * These APIs allow you to manage Clean Rooms, Providers, Recipient Activation, Recipients, Shares, etc.
 */

import {ApiClient} from "../../api-client";
import * as sharing from "./model";
import {EmptyResponse} from "../../types";
import Time from "../../retries/Time";
import retry from "../../retries/retries";
import {CancellationToken} from "../../types";
import {ApiError, ApiRetriableError} from "../apiError";
import {context, Context} from "../../context";
import {ExposedLoggers, withLogContext} from "../../logging";
import {Waiter, asWaiter} from "../../wait";

import * as catalog from "../catalog";

export class CleanRoomsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("CleanRooms", method, message);
    }
}
export class CleanRoomsError extends ApiError {
    constructor(method: string, message?: string) {
        super("CleanRooms", method, message);
    }
}

/**
 * A clean room is a secure, privacy-protecting environment where two or more
 * parties can share sensitive enterprise data, including customer data, for
 * measurements, insights, activation and other use cases.
 *
 * To create clean rooms, you must be a metastore admin or a user with the
 * **CREATE_CLEAN_ROOM** privilege.
 */
export class CleanRoomsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: sharing.CreateCleanRoom,
        @context context?: Context
    ): Promise<sharing.CleanRoomInfo> {
        const path = "/api/2.1/unity-catalog/clean-rooms";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as sharing.CleanRoomInfo;
    }

    /**
     * Create a clean room.
     *
     * Creates a new clean room with specified colaborators. The caller must be a
     * metastore admin or have the **CREATE_CLEAN_ROOM** privilege on the
     * metastore.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: sharing.CreateCleanRoom,
        @context context?: Context
    ): Promise<sharing.CleanRoomInfo> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: sharing.DeleteCleanRoomRequest,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = `/api/2.1/unity-catalog/clean-rooms/${request.name_arg}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Delete a clean room.
     *
     * Deletes a data object clean room from the metastore. The caller must be an
     * owner of the clean room.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: sharing.DeleteCleanRoomRequest,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: sharing.GetCleanRoomRequest,
        @context context?: Context
    ): Promise<sharing.CleanRoomInfo> {
        const path = `/api/2.1/unity-catalog/clean-rooms/${request.name_arg}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as sharing.CleanRoomInfo;
    }

    /**
     * Get a clean room.
     *
     * Gets a data object clean room from the metastore. The caller must be a
     * metastore admin or the owner of the clean room.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: sharing.GetCleanRoomRequest,
        @context context?: Context
    ): Promise<sharing.CleanRoomInfo> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        @context context?: Context
    ): Promise<sharing.ListCleanRoomsResponse> {
        const path = "/api/2.1/unity-catalog/clean-rooms";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as sharing.ListCleanRoomsResponse;
    }

    /**
     * List clean rooms.
     *
     * Gets an array of data object clean rooms from the metastore. The caller
     * must be a metastore admin or the owner of the clean room. There is no
     * guarantee of a specific ordering of the elements in the array.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        @context context?: Context
    ): AsyncIterable<sharing.CleanRoomInfo> {
        const response = (await this._list(context)).clean_rooms;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: sharing.UpdateCleanRoom,
        @context context?: Context
    ): Promise<sharing.CleanRoomInfo> {
        const path = `/api/2.1/unity-catalog/clean-rooms/${request.name_arg}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as sharing.CleanRoomInfo;
    }

    /**
     * Update a clean room.
     *
     * Updates the clean room with the changes and data objects in the request.
     * The caller must be the owner of the clean room or a metastore admin.
     *
     * When the caller is a metastore admin, only the __owner__ field can be
     * updated.
     *
     * In the case that the clean room name is changed **updateCleanRoom**
     * requires that the caller is both the clean room owner and a metastore
     * admin.
     *
     * For each table that is added through this method, the clean room owner
     * must also have **SELECT** privilege on the table. The privilege must be
     * maintained indefinitely for recipients to be able to access the table.
     * Typically, you should use a group as the clean room owner.
     *
     * Table removals through **update** do not require additional privileges.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: sharing.UpdateCleanRoom,
        @context context?: Context
    ): Promise<sharing.CleanRoomInfo> {
        return await this._update(request, context);
    }
}

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
        request: sharing.CreateProvider,
        @context context?: Context
    ): Promise<sharing.ProviderInfo> {
        const path = "/api/2.1/unity-catalog/providers";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as sharing.ProviderInfo;
    }

    /**
     * Create an auth provider.
     *
     * Creates a new authentication provider minimally based on a name and
     * authentication type. The caller must be an admin on the metastore.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: sharing.CreateProvider,
        @context context?: Context
    ): Promise<sharing.ProviderInfo> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: sharing.DeleteProviderRequest,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = `/api/2.1/unity-catalog/providers/${request.name}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Delete a provider.
     *
     * Deletes an authentication provider, if the caller is a metastore admin or
     * is the owner of the provider.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: sharing.DeleteProviderRequest,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: sharing.GetProviderRequest,
        @context context?: Context
    ): Promise<sharing.ProviderInfo> {
        const path = `/api/2.1/unity-catalog/providers/${request.name}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as sharing.ProviderInfo;
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
        request: sharing.GetProviderRequest,
        @context context?: Context
    ): Promise<sharing.ProviderInfo> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: sharing.ListProvidersRequest,
        @context context?: Context
    ): Promise<sharing.ListProvidersResponse> {
        const path = "/api/2.1/unity-catalog/providers";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as sharing.ListProvidersResponse;
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
        request: sharing.ListProvidersRequest,
        @context context?: Context
    ): AsyncIterable<sharing.ProviderInfo> {
        const response = (await this._list(request, context)).providers;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _listShares(
        request: sharing.ListSharesRequest,
        @context context?: Context
    ): Promise<sharing.ListProviderSharesResponse> {
        const path = `/api/2.1/unity-catalog/providers/${request.name}/shares`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as sharing.ListProviderSharesResponse;
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
        request: sharing.ListSharesRequest,
        @context context?: Context
    ): AsyncIterable<sharing.ProviderShare> {
        const response = (await this._listShares(request, context)).shares;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: sharing.UpdateProvider,
        @context context?: Context
    ): Promise<sharing.ProviderInfo> {
        const path = `/api/2.1/unity-catalog/providers/${request.name}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as sharing.ProviderInfo;
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
        request: sharing.UpdateProvider,
        @context context?: Context
    ): Promise<sharing.ProviderInfo> {
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
        request: sharing.GetActivationUrlInfoRequest,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = `/api/2.1/unity-catalog/public/data_sharing_activation_info/${request.activation_url}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Get a share activation URL.
     *
     * Gets an activation URL for a share.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getActivationUrlInfo(
        request: sharing.GetActivationUrlInfoRequest,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._getActivationUrlInfo(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _retrieveToken(
        request: sharing.RetrieveTokenRequest,
        @context context?: Context
    ): Promise<sharing.RetrieveTokenResponse> {
        const path = `/api/2.1/unity-catalog/public/data_sharing_activation/${request.activation_url}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as sharing.RetrieveTokenResponse;
    }

    /**
     * Get an access token.
     *
     * Retrieve access token with an activation url. This is a public API without
     * any authentication.
     */
    @withLogContext(ExposedLoggers.SDK)
    async retrieveToken(
        request: sharing.RetrieveTokenRequest,
        @context context?: Context
    ): Promise<sharing.RetrieveTokenResponse> {
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
        request: sharing.CreateRecipient,
        @context context?: Context
    ): Promise<sharing.RecipientInfo> {
        const path = "/api/2.1/unity-catalog/recipients";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as sharing.RecipientInfo;
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
        request: sharing.CreateRecipient,
        @context context?: Context
    ): Promise<sharing.RecipientInfo> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: sharing.DeleteRecipientRequest,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = `/api/2.1/unity-catalog/recipients/${request.name}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Delete a share recipient.
     *
     * Deletes the specified recipient from the metastore. The caller must be the
     * owner of the recipient.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: sharing.DeleteRecipientRequest,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: sharing.GetRecipientRequest,
        @context context?: Context
    ): Promise<sharing.RecipientInfo> {
        const path = `/api/2.1/unity-catalog/recipients/${request.name}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as sharing.RecipientInfo;
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
        request: sharing.GetRecipientRequest,
        @context context?: Context
    ): Promise<sharing.RecipientInfo> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: sharing.ListRecipientsRequest,
        @context context?: Context
    ): Promise<sharing.ListRecipientsResponse> {
        const path = "/api/2.1/unity-catalog/recipients";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as sharing.ListRecipientsResponse;
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
        request: sharing.ListRecipientsRequest,
        @context context?: Context
    ): AsyncIterable<sharing.RecipientInfo> {
        const response = (await this._list(request, context)).recipients;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _rotateToken(
        request: sharing.RotateRecipientToken,
        @context context?: Context
    ): Promise<sharing.RecipientInfo> {
        const path = `/api/2.1/unity-catalog/recipients/${request.name}/rotate-token`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as sharing.RecipientInfo;
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
        request: sharing.RotateRecipientToken,
        @context context?: Context
    ): Promise<sharing.RecipientInfo> {
        return await this._rotateToken(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _sharePermissions(
        request: sharing.SharePermissionsRequest,
        @context context?: Context
    ): Promise<sharing.GetRecipientSharePermissionsResponse> {
        const path = `/api/2.1/unity-catalog/recipients/${request.name}/share-permissions`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as sharing.GetRecipientSharePermissionsResponse;
    }

    /**
     * Get recipient share permissions.
     *
     * Gets the share permissions for the specified Recipient. The caller must be
     * a metastore admin or the owner of the Recipient.
     */
    @withLogContext(ExposedLoggers.SDK)
    async sharePermissions(
        request: sharing.SharePermissionsRequest,
        @context context?: Context
    ): Promise<sharing.GetRecipientSharePermissionsResponse> {
        return await this._sharePermissions(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: sharing.UpdateRecipient,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = `/api/2.1/unity-catalog/recipients/${request.name}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as EmptyResponse;
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
        request: sharing.UpdateRecipient,
        @context context?: Context
    ): Promise<EmptyResponse> {
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
        request: sharing.CreateShare,
        @context context?: Context
    ): Promise<sharing.ShareInfo> {
        const path = "/api/2.1/unity-catalog/shares";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as sharing.ShareInfo;
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
        request: sharing.CreateShare,
        @context context?: Context
    ): Promise<sharing.ShareInfo> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: sharing.DeleteShareRequest,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = `/api/2.1/unity-catalog/shares/${request.name}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Delete a share.
     *
     * Deletes a data object share from the metastore. The caller must be an
     * owner of the share.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: sharing.DeleteShareRequest,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: sharing.GetShareRequest,
        @context context?: Context
    ): Promise<sharing.ShareInfo> {
        const path = `/api/2.1/unity-catalog/shares/${request.name}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as sharing.ShareInfo;
    }

    /**
     * Get a share.
     *
     * Gets a data object share from the metastore. The caller must be a
     * metastore admin or the owner of the share.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: sharing.GetShareRequest,
        @context context?: Context
    ): Promise<sharing.ShareInfo> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        @context context?: Context
    ): Promise<sharing.ListSharesResponse> {
        const path = "/api/2.1/unity-catalog/shares";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as sharing.ListSharesResponse;
    }

    /**
     * List shares.
     *
     * Gets an array of data object shares from the metastore. The caller must be
     * a metastore admin or the owner of the share. There is no guarantee of a
     * specific ordering of the elements in the array.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(@context context?: Context): AsyncIterable<sharing.ShareInfo> {
        const response = (await this._list(context)).shares;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _sharePermissions(
        request: sharing.SharePermissionsRequest,
        @context context?: Context
    ): Promise<catalog.PermissionsList> {
        const path = `/api/2.1/unity-catalog/shares/${request.name}/permissions`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as catalog.PermissionsList;
    }

    /**
     * Get permissions.
     *
     * Gets the permissions for a data share from the metastore. The caller must
     * be a metastore admin or the owner of the share.
     */
    @withLogContext(ExposedLoggers.SDK)
    async sharePermissions(
        request: sharing.SharePermissionsRequest,
        @context context?: Context
    ): Promise<catalog.PermissionsList> {
        return await this._sharePermissions(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: sharing.UpdateShare,
        @context context?: Context
    ): Promise<sharing.ShareInfo> {
        const path = `/api/2.1/unity-catalog/shares/${request.name}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as sharing.ShareInfo;
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
        request: sharing.UpdateShare,
        @context context?: Context
    ): Promise<sharing.ShareInfo> {
        return await this._update(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _updatePermissions(
        request: sharing.UpdateSharePermissions,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = `/api/2.1/unity-catalog/shares/${request.name}/permissions`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as EmptyResponse;
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
        request: sharing.UpdateSharePermissions,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._updatePermissions(request, context);
    }
}
