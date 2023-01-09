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

export class CatalogsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Catalogs", method, message);
    }
}
export class CatalogsError extends ApiError {
    constructor(method: string, message?: string) {
        super("Catalogs", method, message);
    }
}

/**
 * A catalog is the first layer of Unity Catalog’s three-level namespace.
 * It’s used to organize your data assets. Users can see all catalogs on which
 * they have been assigned the USE_CATALOG data permission.
 *
 * In Unity Catalog, admins and data stewards manage users and their access to
 * data centrally across all of the workspaces in a Databricks account. Users in
 * different workspaces can share access to the same data, depending on
 * privileges granted centrally in Unity Catalog.
 */
export class CatalogsService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create a catalog.
     *
     * Creates a new catalog instance in the parent Metastore if the caller is a
     * Metastore admin or has the CREATE_CATALOG privilege.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateCatalog,
        @context context?: Context
    ): Promise<model.CatalogInfo> {
        const path = "/api/2.1/unity-catalog/catalogs";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CatalogInfo;
    }

    /**
     * Delete a catalog.
     *
     * Deletes the catalog that matches the supplied name. The caller must be a
     * Metastore admin or the owner of the catalog.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteCatalogRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.1/unity-catalog/catalogs/${request.name}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Get a catalog.
     *
     * Gets an array of all catalogs in the current Metastore for which the user
     * is an admin or Catalog owner, or has the USE_CATALOG privilege set for
     * their account.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetCatalogRequest,
        @context context?: Context
    ): Promise<model.CatalogInfo> {
        const path = `/api/2.1/unity-catalog/catalogs/${request.name}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.CatalogInfo;
    }

    /**
     * List catalogs.
     *
     * Gets an array of catalogs in the Metastore. If the caller is the Metastore
     * admin, all catalogs will be retrieved. Otherwise, only catalogs owned by
     * the caller (or for which the caller has the USE_CATALOG privilege) will be
     * retrieved.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        @context context?: Context
    ): Promise<model.ListCatalogsResponse> {
        const path = "/api/2.1/unity-catalog/catalogs";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.ListCatalogsResponse;
    }

    /**
     * Update a catalog.
     *
     * Updates the catalog that matches the supplied name. The caller must be
     * either the owner of the catalog, or a Metastore admin (when changing the
     * owner field of the catalog).
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateCatalog,
        @context context?: Context
    ): Promise<model.CatalogInfo> {
        const path = `/api/2.1/unity-catalog/catalogs/${request.name}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.CatalogInfo;
    }
}

export class ExternalLocationsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("ExternalLocations", method, message);
    }
}
export class ExternalLocationsError extends ApiError {
    constructor(method: string, message?: string) {
        super("ExternalLocations", method, message);
    }
}

/**
 * An external location is an object that combines a cloud storage path with a
 * storage credential that authorizes access to the cloud storage path. Each
 * external location is subject to Unity Catalog access-control policies that
 * control which users and groups can access the credential. If a user does not
 * have access to an external location in Unity Catalog, the request fails and
 * Unity Catalog does not attempt to authenticate to your cloud tenant on the
 * user’s behalf.
 *
 * Databricks recommends using external locations rather than using storage
 * credentials directly.
 *
 * To create external locations, you must be a metastore admin or a user with the
 * CREATE_EXTERNAL_LOCATION privilege.
 */
export class ExternalLocationsService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create an external location.
     *
     * Creates a new External Location entry in the Metastore. The caller must be
     * a Metastore admin or have the CREATE_EXTERNAL_LOCATION privilege on both
     * the Metastore and the associated storage credential.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateExternalLocation,
        @context context?: Context
    ): Promise<model.ExternalLocationInfo> {
        const path = "/api/2.1/unity-catalog/external-locations";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.ExternalLocationInfo;
    }

    /**
     * Delete an external location.
     *
     * Deletes the specified external location from the Metastore. The caller
     * must be the owner of the external location.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteExternalLocationRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.1/unity-catalog/external-locations/${request.name}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Get an external location.
     *
     * Gets an external location from the Metastore. The caller must be either a
     * Metastore admin, the owner of the external location, or has some privilege
     * on the external location.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetExternalLocationRequest,
        @context context?: Context
    ): Promise<model.ExternalLocationInfo> {
        const path = `/api/2.1/unity-catalog/external-locations/${request.name}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ExternalLocationInfo;
    }

    /**
     * List external locations.
     *
     * Gets an array of External Locations (ExternalLocationInfo objects) from
     * the Metastore. The caller must be a Metastore admin, is the owner of the
     * external location, or has some privilege on the external location.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        @context context?: Context
    ): Promise<model.ListExternalLocationsResponse> {
        const path = "/api/2.1/unity-catalog/external-locations";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.ListExternalLocationsResponse;
    }

    /**
     * Update an external location.
     *
     * Updates an external location in the Metastore. The caller must be the
     * owner of the external location, or be a Metastore admin. In the second
     * case, the admin can only update the name of the external location.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateExternalLocation,
        @context context?: Context
    ): Promise<model.ExternalLocationInfo> {
        const path = `/api/2.1/unity-catalog/external-locations/${request.name}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.ExternalLocationInfo;
    }
}

export class GrantsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Grants", method, message);
    }
}
export class GrantsError extends ApiError {
    constructor(method: string, message?: string) {
        super("Grants", method, message);
    }
}

/**
 * In Unity Catalog, data is secure by default. Initially, users have no access
 * to data in a metastore. Access can be granted by either a metastore admin, the
 * owner of an object, or the owner of the catalog or schema that contains the
 * object. Securable objects in Unity Catalog are hierarchical and privileges are
 * inherited downward.
 *
 * Initially, users have no access to data in a metastore. Access can be granted
 * by either a metastore admin, the owner of an object, or the owner of the
 * catalog or schema that contains the object.
 *
 * Securable objects in Unity Catalog are hierarchical and privileges are
 * inherited downward. This means that granting a privilege on the catalog
 * automatically grants the privilege to all current and future objects within
 * the catalog. Similarly, privileges granted on a schema are inherited by all
 * current and future objects within that schema.
 */
export class GrantsService {
    constructor(readonly client: ApiClient) {}
    /**
     * Get permissions.
     *
     * Gets the permissions for a Securable type.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetGrantRequest,
        @context context?: Context
    ): Promise<model.GetPermissionsResponse> {
        const path = `/api/2.1/unity-catalog/permissions/${request.securable_type}/${request.full_name}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetPermissionsResponse;
    }

    /**
     * Update permissions.
     *
     * Updates the permissions for a Securable type.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdatePermissions,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.1/unity-catalog/permissions/${request.securable_type}/${request.full_name}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
    }
}

export class MetastoresRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Metastores", method, message);
    }
}
export class MetastoresError extends ApiError {
    constructor(method: string, message?: string) {
        super("Metastores", method, message);
    }
}

/**
 * A metastore is the top-level container of objects in Unity Catalog. It stores
 * data assets (tables and views) and the permissions that govern access to them.
 * Databricks account admins can create metastores and assign them to Databricks
 * workspaces to control which workloads use each metastore. For a workspace to
 * use Unity Catalog, it must have a Unity Catalog metastore attached.
 *
 * Each metastore is configured with a root storage location in a cloud storage
 * account. This storage location is used for metadata and managed tables data.
 *
 * NOTE: This metastore is distinct from the metastore included in Databricks
 * workspaces created before Unity Catalog was released. If your workspace
 * includes a legacy Hive metastore, the data in that metastore is available in
 * Unity Catalog in a catalog named hive_metastore.
 */
export class MetastoresService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create an assignment.
     *
     * Creates a new Metastore assignment. If an assignment for the same
     * __workspace_id__ exists, it will be overwritten by the new
     * __metastore_id__ and __default_catalog_name__. The caller must be an
     * account admin.
     */
    @withLogContext(ExposedLoggers.SDK)
    async assign(
        request: model.CreateMetastoreAssignment,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.1/unity-catalog/workspaces/${request.workspace_id}/metastore`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Create a Metastore.
     *
     * Creates a new Metastore based on a provided name and storage root path.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateMetastore,
        @context context?: Context
    ): Promise<model.MetastoreInfo> {
        const path = "/api/2.1/unity-catalog/metastores";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.MetastoreInfo;
    }

    /**
     * Delete a Metastore.
     *
     * Deletes a Metastore. The caller must be a Metastore admin.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteMetastoreRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.1/unity-catalog/metastores/${request.id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Get a Metastore.
     *
     * Gets a Metastore that matches the supplied ID. The caller must be a
     * Metastore admin to retrieve this info.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetMetastoreRequest,
        @context context?: Context
    ): Promise<model.MetastoreInfo> {
        const path = `/api/2.1/unity-catalog/metastores/${request.id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.MetastoreInfo;
    }

    /**
     * List Metastores.
     *
     * Gets an array of the available Metastores (as MetastoreInfo objects). The
     * caller must be an admin to retrieve this info.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        @context context?: Context
    ): Promise<model.ListMetastoresResponse> {
        const path = "/api/2.1/unity-catalog/metastores";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.ListMetastoresResponse;
    }

    /**
     * Get a summary.
     *
     * Gets information about a Metastore. This summary includes the storage
     * credential, the cloud vendor, the cloud region, and the global Metastore
     * ID.
     */
    @withLogContext(ExposedLoggers.SDK)
    async summary(
        @context context?: Context
    ): Promise<model.GetMetastoreSummaryResponse> {
        const path = "/api/2.1/unity-catalog/metastore_summary";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.GetMetastoreSummaryResponse;
    }

    /**
     * Delete an assignment.
     *
     * Deletes a Metastore assignment. The caller must be an account
     * administrator.
     */
    @withLogContext(ExposedLoggers.SDK)
    async unassign(
        request: model.UnassignRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.1/unity-catalog/workspaces/${request.workspace_id}/metastore`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Update a Metastore.
     *
     * Updates information for a specific Metastore. The caller must be a
     * Metastore admin.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateMetastore,
        @context context?: Context
    ): Promise<model.MetastoreInfo> {
        const path = `/api/2.1/unity-catalog/metastores/${request.id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.MetastoreInfo;
    }

    /**
     * Update an assignment.
     *
     * Updates a Metastore assignment. This operation can be used to update
     * __metastore_id__ or __default_catalog_name__ for a specified Workspace, if
     * the Workspace is already assigned a Metastore. The caller must be an
     * account admin to update __metastore_id__; otherwise, the caller can be a
     * Workspace admin.
     */
    @withLogContext(ExposedLoggers.SDK)
    async updateAssignment(
        request: model.UpdateMetastoreAssignment,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.1/unity-catalog/workspaces/${request.workspace_id}/metastore`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
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
 * Databricks Delta Sharing: Providers REST API
 */
export class ProvidersService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create an auth provider.
     *
     * Creates a new authentication provider minimally based on a name and
     * authentication type. The caller must be an admin on the Metastore.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
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
     * Delete a provider.
     *
     * Deletes an authentication provider, if the caller is a Metastore admin or
     * is the owner of the provider.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
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
     * Get a provider.
     *
     * Gets a specific authentication provider. The caller must supply the name
     * of the provider, and must either be a Metastore admin or the owner of the
     * provider.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
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
     * List providers.
     *
     * Gets an array of available authentication providers. The caller must
     * either be a Metastore admin or the owner of the providers. Providers not
     * owned by the caller are not included in the response.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
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
     * List shares.
     *
     * Gets an array of all shares within the Metastore where:
     *
     * * the caller is a Metastore admin, or * the caller is the owner.
     */
    @withLogContext(ExposedLoggers.SDK)
    async listShares(
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
     * Update a provider.
     *
     * Updates the information for an authentication provider, if the caller is a
     * Metastore admin or is the owner of the provider. If the update changes the
     * provider name, the caller must be both a Metastore admin and the owner of
     * the provider.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
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
 * Databricks Delta Sharing: Recipient Activation REST API
 */
export class RecipientActivationService {
    constructor(readonly client: ApiClient) {}
    /**
     * Get a share activation URL.
     *
     * Gets information about an Activation URL.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getActivationUrlInfo(
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
     * Get an access token.
     *
     * RPC to retrieve access token with an activation token. This is a public
     * API without any authentication.
     */
    @withLogContext(ExposedLoggers.SDK)
    async retrieveToken(
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
 * Databricks Delta Sharing: Recipients REST API
 */
export class RecipientsService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create a share recipient.
     *
     * Creates a new recipient with the delta sharing authentication type in the
     * Metastore. The caller must be a Metastore admin or has the
     * CREATE_RECIPIENT privilege on the Metastore.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
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
     * Delete a share recipient.
     *
     * Deletes the specified recipient from the Metastore. The caller must be the
     * owner of the recipient.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
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
     * Get a share recipient.
     *
     * Gets a share recipient from the Metastore if:
     *
     * * the caller is the owner of the share recipient, or: * is a Metastore
     * admin
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
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
     * List share recipients.
     *
     * Gets an array of all share recipients within the current Metastore where:
     *
     * * the caller is a Metastore admin, or * the caller is the owner.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
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
        const path = `/api/2.1/unity-catalog/recipients/${request.name}/rotate-token`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.RecipientInfo;
    }

    /**
     * Get share permissions.
     *
     * Gets the share permissions for the specified Recipient. The caller must be
     * a Metastore admin or the owner of the Recipient.
     */
    @withLogContext(ExposedLoggers.SDK)
    async sharePermissions(
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
     * Update a share recipient.
     *
     * Updates an existing recipient in the Metastore. The caller must be a
     * Metastore admin or the owner of the recipient. If the recipient name will
     * be updated, the user must be both a Metastore admin and the owner of the
     * recipient.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
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
}

export class SchemasRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Schemas", method, message);
    }
}
export class SchemasError extends ApiError {
    constructor(method: string, message?: string) {
        super("Schemas", method, message);
    }
}

/**
 * A schema (also called a database) is the second layer of Unity Catalog’s
 * three-level namespace. A schema organizes tables and views. To access (or
 * list) a table or view in a schema, users must have the USE_SCHEMA data
 * permission on the schema and its parent catalog, and they must have the SELECT
 * permission on the table or view.
 */
export class SchemasService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create a schema.
     *
     * Creates a new schema for catalog in the Metatastore. The caller must be a
     * Metastore admin, or have the CREATE_SCHEMA privilege in the parent
     * catalog.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateSchema,
        @context context?: Context
    ): Promise<model.SchemaInfo> {
        const path = "/api/2.1/unity-catalog/schemas";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.SchemaInfo;
    }

    /**
     * Delete a schema.
     *
     * Deletes the specified schema from the parent catalog. The caller must be
     * the owner of the schema or an owner of the parent catalog.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteSchemaRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.1/unity-catalog/schemas/${request.full_name}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Get a schema.
     *
     * Gets the specified schema for a catalog in the Metastore. The caller must
     * be a Metastore admin, the owner of the schema, or a user that has the
     * USE_SCHEMA privilege on the schema.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetSchemaRequest,
        @context context?: Context
    ): Promise<model.SchemaInfo> {
        const path = `/api/2.1/unity-catalog/schemas/${request.full_name}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.SchemaInfo;
    }

    /**
     * List schemas.
     *
     * Gets an array of schemas for catalog in the Metastore. If the caller is
     * the Metastore admin or the owner of the parent catalog, all schemas for
     * the catalog will be retrieved. Otherwise, only schemas owned by the caller
     * (or for which the caller has the USE_SCHEMA privilege) will be retrieved.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.ListSchemasRequest,
        @context context?: Context
    ): Promise<model.ListSchemasResponse> {
        const path = "/api/2.1/unity-catalog/schemas";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListSchemasResponse;
    }

    /**
     * Update a schema.
     *
     * Updates a schema for a catalog. The caller must be the owner of the
     * schema. If the caller is a Metastore admin, only the __owner__ field can
     * be changed in the update. If the __name__ field must be updated, the
     * caller must be a Metastore admin or have the CREATE_SCHEMA privilege on
     * the parent catalog.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateSchema,
        @context context?: Context
    ): Promise<model.SchemaInfo> {
        const path = `/api/2.1/unity-catalog/schemas/${request.full_name}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.SchemaInfo;
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
 * Databricks Delta Sharing: Shares REST API
 */
export class SharesService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create a share.
     *
     * Creates a new share for data objects. Data objects can be added at this
     * time or after creation with **update**. The caller must be a Metastore
     * admin or have the CREATE_SHARE privilege on the Metastore.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
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
     * Delete a share.
     *
     * Deletes a data object share from the Metastore. The caller must be an
     * owner of the share.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
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
     * Get a share.
     *
     * Gets a data object share from the Metastore. The caller must be a
     * Metastore admin or the owner of the share.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
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
     * List shares.
     *
     * Gets an array of data object shares from the Metastore. The caller must be
     * a Metastore admin or the owner of the share.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(@context context?: Context): Promise<model.ListSharesResponse> {
        const path = "/api/2.1/unity-catalog/shares";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.ListSharesResponse;
    }

    /**
     * Get permissions.
     *
     * Gets the permissions for a data share from the Metastore. The caller must
     * be a Metastore admin or the owner of the share.
     */
    @withLogContext(ExposedLoggers.SDK)
    async sharePermissions(
        request: model.SharePermissionsRequest,
        @context context?: Context
    ): Promise<model.GetSharePermissionsResponse> {
        const path = `/api/2.1/unity-catalog/shares/${request.name}/permissions`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetSharePermissionsResponse;
    }

    /**
     * Update a share.
     *
     * Updates the share with the changes and data objects in the request. The
     * caller must be the owner of the share or a Metastore admin.
     *
     * When the caller is a Metastore admin, only the __owner__ field can be
     * updated.
     *
     * In the case that the Share name is changed, **updateShare** requires that
     * the caller is both the share owner and a Metastore admin.
     *
     * For each table that is added through this method, the share owner must
     * also have SELECT privilege on the table. This privilege must be maintained
     * indefinitely for recipients to be able to access the table. Typically, you
     * should use a group as the share owner.
     *
     * Table removals through **update** do not require additional privileges.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
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
     * Update permissions.
     *
     * Updates the permissions for a data share in the Metastore. The caller must
     * be a Metastore admin or an owner of the share.
     *
     * For new recipient grants, the user must also be the owner of the
     * recipients. recipient revocations do not require additional privileges.
     */
    @withLogContext(ExposedLoggers.SDK)
    async updatePermissions(
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
}

export class StorageCredentialsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("StorageCredentials", method, message);
    }
}
export class StorageCredentialsError extends ApiError {
    constructor(method: string, message?: string) {
        super("StorageCredentials", method, message);
    }
}

/**
 * A storage credential represents an authentication and authorization mechanism
 * for accessing data stored on your cloud tenant, using an IAM role. Each
 * storage credential is subject to Unity Catalog access-control policies that
 * control which users and groups can access the credential. If a user does not
 * have access to a storage credential in Unity Catalog, the request fails and
 * Unity Catalog does not attempt to authenticate to your cloud tenant on the
 * user’s behalf.
 *
 * Databricks recommends using external locations rather than using storage
 * credentials directly.
 *
 * To create storage credentials, you must be a Databricks account admin. The
 * account admin who creates the storage credential can delegate ownership to
 * another user or group to manage permissions on it.
 */
export class StorageCredentialsService {
    constructor(readonly client: ApiClient) {}
    /**
     * Create credentials.
     *
     * Creates a new storage credential. The request object is specific to the
     * cloud:
     *
     * * **AwsIamRole** for AWS credentials * **AzureServicePrincipal** for Azure
     * credentials * **GcpServiceAcountKey** for GCP credentials.
     *
     * The caller must be a Metastore admin and have the
     * CREATE_STORAGE_CREDENTIAL privilege on the Metastore.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateStorageCredential,
        @context context?: Context
    ): Promise<model.StorageCredentialInfo> {
        const path = "/api/2.1/unity-catalog/storage-credentials";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.StorageCredentialInfo;
    }

    /**
     * Delete a credential.
     *
     * Deletes a storage credential from the Metastore. The caller must be an
     * owner of the storage credential.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteStorageCredentialRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.1/unity-catalog/storage-credentials/${request.name}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Get a credential.
     *
     * Gets a storage credential from the Metastore. The caller must be a
     * Metastore admin, the owner of the storage credential, or have a level of
     * privilege on the storage credential.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetStorageCredentialRequest,
        @context context?: Context
    ): Promise<model.StorageCredentialInfo> {
        const path = `/api/2.1/unity-catalog/storage-credentials/${request.name}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.StorageCredentialInfo;
    }

    /**
     * List credentials.
     *
     * Gets an array of storage credentials (as StorageCredentialInfo objects).
     * The array is limited to only those storage credentials the caller has the
     * privilege level to access. If the caller is a Metastore admin, all storage
     * credentials will be retrieved.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        @context context?: Context
    ): Promise<model.ListStorageCredentialsResponse> {
        const path = "/api/2.1/unity-catalog/storage-credentials";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.ListStorageCredentialsResponse;
    }

    /**
     * Update a credential.
     *
     * Updates a storage credential on the Metastore. The caller must be the
     * owner of the storage credential. If the caller is a Metastore admin, only
     * the __owner__ credential can be changed.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateStorageCredential,
        @context context?: Context
    ): Promise<model.StorageCredentialInfo> {
        const path = `/api/2.1/unity-catalog/storage-credentials/${request.name}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.StorageCredentialInfo;
    }
}

export class TablesRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Tables", method, message);
    }
}
export class TablesError extends ApiError {
    constructor(method: string, message?: string) {
        super("Tables", method, message);
    }
}

/**
 * A table resides in the third layer of Unity Catalog’s three-level namespace.
 * It contains rows of data. To create a table, users must have CREATE_TABLE and
 * USE_SCHEMA permissions on the schema, and they must have the USE_CATALOG
 * permission on its parent catalog. To query a table, users must have the SELECT
 * permission on the table, and they must have the USE_CATALOG permission on its
 * parent catalog and the USE_SCHEMA permission on its parent schema.
 *
 * A table can be managed or external.
 */
export class TablesService {
    constructor(readonly client: ApiClient) {}
    /**
     * Delete a table.
     *
     * Deletes a table from the specified parent catalog and schema. The caller
     * must be the owner of the parent catalog, have the USE_CATALOG privilege on
     * the parent catalog and be the owner of the parent schema, or be the owner
     * of the table and have the USE_CATALOG privilege on the parent catalog and
     * the USE_SCHEMA privilege on the parent schema.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteTableRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.1/unity-catalog/tables/${request.full_name}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Get a table.
     *
     * Gets a table from the Metastore for a specific catalog and schema. The
     * caller must be a Metastore admin, be the owner of the table and have the
     * USE_CATALOG privilege on the parent catalog and the USE_SCHEMA privilege
     * on the parent schema, or be the owner of the table and have the SELECT
     * privilege on it as well.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetTableRequest,
        @context context?: Context
    ): Promise<model.TableInfo> {
        const path = `/api/2.1/unity-catalog/tables/${request.full_name}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.TableInfo;
    }

    /**
     * List tables.
     *
     * Gets an array of all tables for the current Metastore under the parent
     * catalog and schema. The caller must be a Metastore admin or an owner of
     * (or have the SELECT privilege on) the table. For the latter case, the
     * caller must also be the owner or have the USE_CATALOG privilege on the
     * parent catalog and the USE_SCHEMA privilege on the parent schema.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.ListTablesRequest,
        @context context?: Context
    ): Promise<model.ListTablesResponse> {
        const path = "/api/2.1/unity-catalog/tables";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListTablesResponse;
    }

    /**
     * List table summaries.
     *
     * Gets an array of summaries for tables for a schema and catalog within the
     * Metastore. The table summaries returned are either:
     *
     * * summaries for all tables (within the current Metastore and parent
     * catalog and schema), when the user is a Metastore admin, or: * summaries
     * for all tables and schemas (within the current Metastore and parent
     * catalog) for which the user has ownership or the SELECT privilege on the
     * Table and ownership or USE_SCHEMA privilege on the Schema, provided that
     * the user also has ownership or the USE_CATALOG privilege on the parent
     * Catalog
     */
    @withLogContext(ExposedLoggers.SDK)
    async tableSummaries(
        request: model.TableSummariesRequest,
        @context context?: Context
    ): Promise<model.ListTableSummariesResponse> {
        const path = "/api/2.1/unity-catalog/table-summaries";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListTableSummariesResponse;
    }
}
