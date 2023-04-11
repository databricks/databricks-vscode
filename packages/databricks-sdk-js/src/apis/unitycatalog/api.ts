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

export class AccountMetastoreAssignmentsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("AccountMetastoreAssignments", method, message);
    }
}
export class AccountMetastoreAssignmentsError extends ApiError {
    constructor(method: string, message?: string) {
        super("AccountMetastoreAssignments", method, message);
    }
}

/**
 * These APIs manage metastore assignments to a workspace.
 */
export class AccountMetastoreAssignmentsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.CreateMetastoreAssignment,
        @context context?: Context
    ): Promise<model.MetastoreAssignment> {
        const path = `/api/2.0/accounts/${this.client.accountId}/workspaces/${request.workspace_id}/metastores/${request.metastore_id}`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.MetastoreAssignment;
    }

    /**
     * Assigns a workspace to a metastore.
     *
     * Creates an assignment to a metastore for a workspace
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateMetastoreAssignment,
        @context context?: Context
    ): Promise<model.MetastoreAssignment> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteAccountMetastoreAssignmentRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/workspaces/${request.workspace_id}/metastores/${request.metastore_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a metastore assignment.
     *
     * Deletes a metastore assignment to a workspace, leaving the workspace with
     * no metastore.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteAccountMetastoreAssignmentRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetAccountMetastoreAssignmentRequest,
        @context context?: Context
    ): Promise<model.MetastoreAssignment> {
        const path = `/api/2.0/accounts/${this.client.accountId}/workspaces/${request.workspace_id}/metastore`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.MetastoreAssignment;
    }

    /**
     * Gets the metastore assignment for a workspace.
     *
     * Gets the metastore assignment, if any, for the workspace specified by ID.
     * If the workspace is assigned a metastore, the mappig will be returned. If
     * no metastore is assigned to the workspace, the assignment will not be
     * found and a 404 returned.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetAccountMetastoreAssignmentRequest,
        @context context?: Context
    ): Promise<model.MetastoreAssignment> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: model.ListAccountMetastoreAssignmentsRequest,
        @context context?: Context
    ): Promise<Array<model.MetastoreAssignment>> {
        const path = `/api/2.0/accounts/${this.client.accountId}/metastores/${request.metastore_id}/workspaces`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as Array<model.MetastoreAssignment>;
    }

    /**
     * Get all workspaces assigned to a metastore.
     *
     * Gets a list of all Databricks workspace IDs that have been assigned to
     * given metastore.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.ListAccountMetastoreAssignmentsRequest,
        @context context?: Context
    ): Promise<Array<model.MetastoreAssignment>> {
        return await this._list(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: model.UpdateMetastoreAssignment,
        @context context?: Context
    ): Promise<model.MetastoreAssignment> {
        const path = `/api/2.0/accounts/${this.client.accountId}/workspaces/${request.workspace_id}/metastores/${request.metastore_id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.MetastoreAssignment;
    }

    /**
     * Updates a metastore assignment to a workspaces.
     *
     * Updates an assignment to a metastore for a workspace. Currently, only the
     * default catalog may be updated
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateMetastoreAssignment,
        @context context?: Context
    ): Promise<model.MetastoreAssignment> {
        return await this._update(request, context);
    }
}

export class AccountMetastoresRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("AccountMetastores", method, message);
    }
}
export class AccountMetastoresError extends ApiError {
    constructor(method: string, message?: string) {
        super("AccountMetastores", method, message);
    }
}

/**
 * These APIs manage Unity Catalog metastores for an account. A metastore
 * contains catalogs that can be associated with workspaces
 */
export class AccountMetastoresService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.CreateMetastore,
        @context context?: Context
    ): Promise<model.MetastoreInfo> {
        const path = `/api/2.0/accounts/${this.client.accountId}/metastores`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.MetastoreInfo;
    }

    /**
     * Create metastore.
     *
     * Creates a Unity Catalog metastore.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateMetastore,
        @context context?: Context
    ): Promise<model.MetastoreInfo> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteAccountMetastoreRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/metastores/${request.metastore_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a metastore.
     *
     * Deletes a Databricks Unity Catalog metastore for an account, both
     * specified by ID.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteAccountMetastoreRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetAccountMetastoreRequest,
        @context context?: Context
    ): Promise<model.MetastoreInfo> {
        const path = `/api/2.0/accounts/${this.client.accountId}/metastores/${request.metastore_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.MetastoreInfo;
    }

    /**
     * Get a metastore.
     *
     * Gets a Databricks Unity Catalog metastore from an account, both specified
     * by ID.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetAccountMetastoreRequest,
        @context context?: Context
    ): Promise<model.MetastoreInfo> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        @context context?: Context
    ): Promise<model.ListMetastoresResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/metastores`;
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.ListMetastoresResponse;
    }

    /**
     * Get all metastores associated with an account.
     *
     * Gets all Unity Catalog metastores associated with an account specified by
     * ID.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        @context context?: Context
    ): Promise<model.ListMetastoresResponse> {
        return await this._list(context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: model.UpdateMetastore,
        @context context?: Context
    ): Promise<model.MetastoreInfo> {
        const path = `/api/2.0/accounts/${this.client.accountId}/metastores/${request.metastore_id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.MetastoreInfo;
    }

    /**
     * Update a metastore.
     *
     * Updates an existing Unity Catalog metastore.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateMetastore,
        @context context?: Context
    ): Promise<model.MetastoreInfo> {
        return await this._update(request, context);
    }
}

export class AccountStorageCredentialsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("AccountStorageCredentials", method, message);
    }
}
export class AccountStorageCredentialsError extends ApiError {
    constructor(method: string, message?: string) {
        super("AccountStorageCredentials", method, message);
    }
}

/**
 * These APIs manage storage credentials for a particular metastore.
 */
export class AccountStorageCredentialsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.CreateStorageCredential,
        @context context?: Context
    ): Promise<model.StorageCredentialInfo> {
        const path = `/api/2.0/accounts/${this.client.accountId}/metastores/${request.metastore_id}/storage-credentials`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.StorageCredentialInfo;
    }

    /**
     * Create a storage credential.
     *
     * Creates a new storage credential. The request object is specific to the
     * cloud:
     *
     * * **AwsIamRole** for AWS credentials * **AzureServicePrincipal** for Azure
     * credentials * **GcpServiceAcountKey** for GCP credentials.
     *
     * The caller must be a metastore admin and have the
     * **CREATE_STORAGE_CREDENTIAL** privilege on the metastore.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateStorageCredential,
        @context context?: Context
    ): Promise<model.StorageCredentialInfo> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetAccountStorageCredentialRequest,
        @context context?: Context
    ): Promise<model.StorageCredentialInfo> {
        const path = `/api/2.0/accounts/${this.client.accountId}/metastores/${request.metastore_id}/storage-credentials/`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.StorageCredentialInfo;
    }

    /**
     * Gets the named storage credential.
     *
     * Gets a storage credential from the metastore. The caller must be a
     * metastore admin, the owner of the storage credential, or have a level of
     * privilege on the storage credential.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetAccountStorageCredentialRequest,
        @context context?: Context
    ): Promise<model.StorageCredentialInfo> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: model.ListAccountStorageCredentialsRequest,
        @context context?: Context
    ): Promise<Array<model.StorageCredentialInfo>> {
        const path = `/api/2.0/accounts/${this.client.accountId}/metastores/${request.metastore_id}/storage-credentials`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as Array<model.StorageCredentialInfo>;
    }

    /**
     * Get all storage credentials assigned to a metastore.
     *
     * Gets a list of all storage credentials that have been assigned to given
     * metastore.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.ListAccountStorageCredentialsRequest,
        @context context?: Context
    ): Promise<Array<model.StorageCredentialInfo>> {
        return await this._list(request, context);
    }
}

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

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
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
     * Create a catalog.
     *
     * Creates a new catalog instance in the parent metastore if the caller is a
     * metastore admin or has the **CREATE_CATALOG** privilege.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateCatalog,
        @context context?: Context
    ): Promise<model.CatalogInfo> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
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
     * Delete a catalog.
     *
     * Deletes the catalog that matches the supplied name. The caller must be a
     * metastore admin or the owner of the catalog.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteCatalogRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
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
     * Get a catalog.
     *
     * Gets the specified catalog in a metastore. The caller must be a metastore
     * admin, the owner of the catalog, or a user that has the **USE_CATALOG**
     * privilege set for their account.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetCatalogRequest,
        @context context?: Context
    ): Promise<model.CatalogInfo> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
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
     * List catalogs.
     *
     * Gets an array of catalogs in the metastore. If the caller is the metastore
     * admin, all catalogs will be retrieved. Otherwise, only catalogs owned by
     * the caller (or for which the caller has the **USE_CATALOG** privilege)
     * will be retrieved. There is no guarantee of a specific ordering of the
     * elements in the array.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(@context context?: Context): AsyncIterable<model.CatalogInfo> {
        const response = (await this._list(context)).catalogs;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
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

    /**
     * Update a catalog.
     *
     * Updates the catalog that matches the supplied name. The caller must be
     * either the owner of the catalog, or a metastore admin (when changing the
     * owner field of the catalog).
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateCatalog,
        @context context?: Context
    ): Promise<model.CatalogInfo> {
        return await this._update(request, context);
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
 * **CREATE_EXTERNAL_LOCATION** privilege.
 */
export class ExternalLocationsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
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
     * Create an external location.
     *
     * Creates a new external location entry in the metastore. The caller must be
     * a metastore admin or have the **CREATE_EXTERNAL_LOCATION** privilege on
     * both the metastore and the associated storage credential.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateExternalLocation,
        @context context?: Context
    ): Promise<model.ExternalLocationInfo> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
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
     * Delete an external location.
     *
     * Deletes the specified external location from the metastore. The caller
     * must be the owner of the external location.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteExternalLocationRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
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
     * Get an external location.
     *
     * Gets an external location from the metastore. The caller must be either a
     * metastore admin, the owner of the external location, or a user that has
     * some privilege on the external location.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetExternalLocationRequest,
        @context context?: Context
    ): Promise<model.ExternalLocationInfo> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
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
     * List external locations.
     *
     * Gets an array of external locations (__ExternalLocationInfo__ objects)
     * from the metastore. The caller must be a metastore admin, the owner of the
     * external location, or a user that has some privilege on the external
     * location. There is no guarantee of a specific ordering of the elements in
     * the array.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        @context context?: Context
    ): AsyncIterable<model.ExternalLocationInfo> {
        const response = (await this._list(context)).external_locations;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
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

    /**
     * Update an external location.
     *
     * Updates an external location in the metastore. The caller must be the
     * owner of the external location, or be a metastore admin. In the second
     * case, the admin can only update the name of the external location.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateExternalLocation,
        @context context?: Context
    ): Promise<model.ExternalLocationInfo> {
        return await this._update(request, context);
    }
}

export class FunctionsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Functions", method, message);
    }
}
export class FunctionsError extends ApiError {
    constructor(method: string, message?: string) {
        super("Functions", method, message);
    }
}

/**
 * Functions implement User-Defined Functions (UDFs) in Unity Catalog.
 *
 * The function implementation can be any SQL expression or Query, and it can be
 * invoked wherever a table reference is allowed in a query. In Unity Catalog, a
 * function resides at the same level as a table, so it can be referenced with
 * the form __catalog_name__.__schema_name__.__function_name__.
 */
export class FunctionsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.CreateFunction,
        @context context?: Context
    ): Promise<model.FunctionInfo> {
        const path = "/api/2.1/unity-catalog/functions";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.FunctionInfo;
    }

    /**
     * Create a function.
     *
     * Creates a new function
     *
     * The user must have the following permissions in order for the function to
     * be created: - **USE_CATALOG** on the function's parent catalog -
     * **USE_SCHEMA** and **CREATE_FUNCTION** on the function's parent schema
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateFunction,
        @context context?: Context
    ): Promise<model.FunctionInfo> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteFunctionRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.1/unity-catalog/functions/${request.name}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a function.
     *
     * Deletes the function that matches the supplied name. For the deletion to
     * succeed, the user must satisfy one of the following conditions: - Is the
     * owner of the function's parent catalog - Is the owner of the function's
     * parent schema and have the **USE_CATALOG** privilege on its parent catalog
     * - Is the owner of the function itself and have both the **USE_CATALOG**
     * privilege on its parent catalog and the **USE_SCHEMA** privilege on its
     * parent schema
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteFunctionRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetFunctionRequest,
        @context context?: Context
    ): Promise<model.FunctionInfo> {
        const path = `/api/2.1/unity-catalog/functions/${request.name}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.FunctionInfo;
    }

    /**
     * Get a function.
     *
     * Gets a function from within a parent catalog and schema. For the fetch to
     * succeed, the user must satisfy one of the following requirements: - Is a
     * metastore admin - Is an owner of the function's parent catalog - Have the
     * **USE_CATALOG** privilege on the function's parent catalog and be the
     * owner of the function - Have the **USE_CATALOG** privilege on the
     * function's parent catalog, the **USE_SCHEMA** privilege on the function's
     * parent schema, and the **EXECUTE** privilege on the function itself
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetFunctionRequest,
        @context context?: Context
    ): Promise<model.FunctionInfo> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: model.ListFunctionsRequest,
        @context context?: Context
    ): Promise<model.ListFunctionsResponse> {
        const path = "/api/2.1/unity-catalog/functions";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListFunctionsResponse;
    }

    /**
     * List functions.
     *
     * List functions within the specified parent catalog and schema. If the user
     * is a metastore admin, all functions are returned in the output list.
     * Otherwise, the user must have the **USE_CATALOG** privilege on the catalog
     * and the **USE_SCHEMA** privilege on the schema, and the output list
     * contains only functions for which either the user has the **EXECUTE**
     * privilege or the user is the owner. There is no guarantee of a specific
     * ordering of the elements in the array.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.ListFunctionsRequest,
        @context context?: Context
    ): Promise<model.ListFunctionsResponse> {
        return await this._list(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: model.UpdateFunction,
        @context context?: Context
    ): Promise<model.FunctionInfo> {
        const path = `/api/2.1/unity-catalog/functions/${request.name}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.FunctionInfo;
    }

    /**
     * Update a function.
     *
     * Updates the function that matches the supplied name. Only the owner of the
     * function can be updated. If the user is not a metastore admin, the user
     * must be a member of the group that is the new function owner. - Is a
     * metastore admin - Is the owner of the function's parent catalog - Is the
     * owner of the function's parent schema and has the **USE_CATALOG**
     * privilege on its parent catalog - Is the owner of the function itself and
     * has the **USE_CATALOG** privilege on its parent catalog as well as the
     * **USE_SCHEMA** privilege on the function's parent schema.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateFunction,
        @context context?: Context
    ): Promise<model.FunctionInfo> {
        return await this._update(request, context);
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
 * Securable objects in Unity Catalog are hierarchical and privileges are
 * inherited downward. This means that granting a privilege on the catalog
 * automatically grants the privilege to all current and future objects within
 * the catalog. Similarly, privileges granted on a schema are inherited by all
 * current and future objects within that schema.
 */
export class GrantsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetGrantRequest,
        @context context?: Context
    ): Promise<model.PermissionsList> {
        const path = `/api/2.1/unity-catalog/permissions/${request.securable_type}/${request.full_name}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.PermissionsList;
    }

    /**
     * Get permissions.
     *
     * Gets the permissions for a securable.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetGrantRequest,
        @context context?: Context
    ): Promise<model.PermissionsList> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _getEffective(
        request: model.GetEffectiveRequest,
        @context context?: Context
    ): Promise<model.EffectivePermissionsList> {
        const path = `/api/2.1/unity-catalog/effective-permissions/${request.securable_type}/${request.full_name}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.EffectivePermissionsList;
    }

    /**
     * Get effective permissions.
     *
     * Gets the effective permissions for a securable.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getEffective(
        request: model.GetEffectiveRequest,
        @context context?: Context
    ): Promise<model.EffectivePermissionsList> {
        return await this._getEffective(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: model.UpdatePermissions,
        @context context?: Context
    ): Promise<model.PermissionsList> {
        const path = `/api/2.1/unity-catalog/permissions/${request.securable_type}/${request.full_name}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.PermissionsList;
    }

    /**
     * Update permissions.
     *
     * Updates the permissions for a securable.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdatePermissions,
        @context context?: Context
    ): Promise<model.PermissionsList> {
        return await this._update(request, context);
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
 * includes a legacy Hive metastore, the data in that metastore is available in a
 * catalog named hive_metastore.
 */
export class MetastoresService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _assign(
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
     * Create an assignment.
     *
     * Creates a new metastore assignment. If an assignment for the same
     * __workspace_id__ exists, it will be overwritten by the new
     * __metastore_id__ and __default_catalog_name__. The caller must be an
     * account admin.
     */
    @withLogContext(ExposedLoggers.SDK)
    async assign(
        request: model.CreateMetastoreAssignment,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._assign(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
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
     * Create a metastore.
     *
     * Creates a new metastore based on a provided name and storage root path.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateMetastore,
        @context context?: Context
    ): Promise<model.MetastoreInfo> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _current(
        @context context?: Context
    ): Promise<model.MetastoreAssignment> {
        const path = "/api/2.1/unity-catalog/current-metastore-assignment";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.MetastoreAssignment;
    }

    /**
     * Get metastore assignment for workspace.
     *
     * Gets the metastore assignment for the workspace being accessed.
     */
    @withLogContext(ExposedLoggers.SDK)
    async current(
        @context context?: Context
    ): Promise<model.MetastoreAssignment> {
        return await this._current(context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
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
     * Delete a metastore.
     *
     * Deletes a metastore. The caller must be a metastore admin.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteMetastoreRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
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
     * Get a metastore.
     *
     * Gets a metastore that matches the supplied ID. The caller must be a
     * metastore admin to retrieve this info.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetMetastoreRequest,
        @context context?: Context
    ): Promise<model.MetastoreInfo> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
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
     * List metastores.
     *
     * Gets an array of the available metastores (as __MetastoreInfo__ objects).
     * The caller must be an admin to retrieve this info. There is no guarantee
     * of a specific ordering of the elements in the array.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        @context context?: Context
    ): AsyncIterable<model.MetastoreInfo> {
        const response = (await this._list(context)).metastores;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _summary(
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
     * Get a metastore summary.
     *
     * Gets information about a metastore. This summary includes the storage
     * credential, the cloud vendor, the cloud region, and the global metastore
     * ID.
     */
    @withLogContext(ExposedLoggers.SDK)
    async summary(
        @context context?: Context
    ): Promise<model.GetMetastoreSummaryResponse> {
        return await this._summary(context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _unassign(
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
     * Delete an assignment.
     *
     * Deletes a metastore assignment. The caller must be an account
     * administrator.
     */
    @withLogContext(ExposedLoggers.SDK)
    async unassign(
        request: model.UnassignRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._unassign(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
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
     * Update a metastore.
     *
     * Updates information for a specific metastore. The caller must be a
     * metastore admin.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateMetastore,
        @context context?: Context
    ): Promise<model.MetastoreInfo> {
        return await this._update(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _updateAssignment(
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

    /**
     * Update an assignment.
     *
     * Updates a metastore assignment. This operation can be used to update
     * __metastore_id__ or __default_catalog_name__ for a specified Workspace, if
     * the Workspace is already assigned a metastore. The caller must be an
     * account admin to update __metastore_id__; otherwise, the caller can be a
     * Workspace admin.
     */
    @withLogContext(ExposedLoggers.SDK)
    async updateAssignment(
        request: model.UpdateMetastoreAssignment,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._updateAssignment(request, context);
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
    async listShares(
        request: model.ListSharesRequest,
        @context context?: Context
    ): Promise<model.ListProviderSharesResponse> {
        return await this._listShares(request, context);
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
 * Databricks Delta Sharing: Recipient Activation REST API
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
 * Databricks Delta Sharing: Recipients REST API
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
 * three-level namespace. A schema organizes tables, views and functions. To
 * access (or list) a table or view in a schema, users must have the USE_SCHEMA
 * data permission on the schema and its parent catalog, and they must have the
 * SELECT permission on the table or view.
 */
export class SchemasService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
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
     * Create a schema.
     *
     * Creates a new schema for catalog in the Metatastore. The caller must be a
     * metastore admin, or have the **CREATE_SCHEMA** privilege in the parent
     * catalog.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateSchema,
        @context context?: Context
    ): Promise<model.SchemaInfo> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
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
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
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
     * Get a schema.
     *
     * Gets the specified schema within the metastore. The caller must be a
     * metastore admin, the owner of the schema, or a user that has the
     * **USE_SCHEMA** privilege on the schema.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetSchemaRequest,
        @context context?: Context
    ): Promise<model.SchemaInfo> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
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
     * List schemas.
     *
     * Gets an array of schemas for a catalog in the metastore. If the caller is
     * the metastore admin or the owner of the parent catalog, all schemas for
     * the catalog will be retrieved. Otherwise, only schemas owned by the caller
     * (or for which the caller has the **USE_SCHEMA** privilege) will be
     * retrieved. There is no guarantee of a specific ordering of the elements in
     * the array.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        request: model.ListSchemasRequest,
        @context context?: Context
    ): AsyncIterable<model.SchemaInfo> {
        const response = (await this._list(request, context)).schemas;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
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

    /**
     * Update a schema.
     *
     * Updates a schema for a catalog. The caller must be the owner of the schema
     * or a metastore admin. If the caller is a metastore admin, only the
     * __owner__ field can be changed in the update. If the __name__ field must
     * be updated, the caller must be a metastore admin or have the
     * **CREATE_SCHEMA** privilege on the parent catalog.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateSchema,
        @context context?: Context
    ): Promise<model.SchemaInfo> {
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
 * Databricks Delta Sharing: Shares REST API
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
     * Creates a new share for data objects. Data objects can be added at this
     * time or after creation with **update**. The caller must be a metastore
     * admin or have the **CREATE_SHARE** privilege on the metastore.
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
        )) as model.PermissionsList;
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
 * for accessing data stored on your cloud tenant. Each storage credential is
 * subject to Unity Catalog access-control policies that control which users and
 * groups can access the credential. If a user does not have access to a storage
 * credential in Unity Catalog, the request fails and Unity Catalog does not
 * attempt to authenticate to your cloud tenant on the user’s behalf.
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

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
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
     * Create a storage credential.
     *
     * Creates a new storage credential. The request object is specific to the
     * cloud:
     *
     * * **AwsIamRole** for AWS credentials * **AzureServicePrincipal** for Azure
     * credentials * **GcpServiceAcountKey** for GCP credentials.
     *
     * The caller must be a metastore admin and have the
     * **CREATE_STORAGE_CREDENTIAL** privilege on the metastore.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateStorageCredential,
        @context context?: Context
    ): Promise<model.StorageCredentialInfo> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
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
     * Delete a credential.
     *
     * Deletes a storage credential from the metastore. The caller must be an
     * owner of the storage credential.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteStorageCredentialRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
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
     * Get a credential.
     *
     * Gets a storage credential from the metastore. The caller must be a
     * metastore admin, the owner of the storage credential, or have some
     * permission on the storage credential.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetStorageCredentialRequest,
        @context context?: Context
    ): Promise<model.StorageCredentialInfo> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        @context context?: Context
    ): Promise<Array<model.StorageCredentialInfo>> {
        const path = "/api/2.1/unity-catalog/storage-credentials";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as Array<model.StorageCredentialInfo>;
    }

    /**
     * List credentials.
     *
     * Gets an array of storage credentials (as __StorageCredentialInfo__
     * objects). The array is limited to only those storage credentials the
     * caller has permission to access. If the caller is a metastore admin, all
     * storage credentials will be retrieved. There is no guarantee of a specific
     * ordering of the elements in the array.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        @context context?: Context
    ): Promise<Array<model.StorageCredentialInfo>> {
        return await this._list(context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
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

    /**
     * Update a credential.
     *
     * Updates a storage credential on the metastore. The caller must be the
     * owner of the storage credential or a metastore admin. If the caller is a
     * metastore admin, only the __owner__ credential can be changed.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateStorageCredential,
        @context context?: Context
    ): Promise<model.StorageCredentialInfo> {
        return await this._update(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _validate(
        request: model.ValidateStorageCredential,
        @context context?: Context
    ): Promise<model.ValidateStorageCredentialResponse> {
        const path = "/api/2.1/unity-catalog/validate-storage-credentials";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.ValidateStorageCredentialResponse;
    }

    /**
     * Validate a storage credential.
     *
     * Validates a storage credential. At least one of __external_location_name__
     * and __url__ need to be provided. If only one of them is provided, it will
     * be used for validation. And if both are provided, the __url__ will be used
     * for validation, and __external_location_name__ will be ignored when
     * checking overlapping urls.
     *
     * Either the __storage_credential_name__ or the cloud-specific credential
     * must be provided.
     *
     * The caller must be a metastore admin or the storage credential owner or
     * have the **CREATE_EXTERNAL_LOCATION** privilege on the metastore and the
     * storage credential.
     */
    @withLogContext(ExposedLoggers.SDK)
    async validate(
        request: model.ValidateStorageCredential,
        @context context?: Context
    ): Promise<model.ValidateStorageCredentialResponse> {
        return await this._validate(request, context);
    }
}

export class TableConstraintsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("TableConstraints", method, message);
    }
}
export class TableConstraintsError extends ApiError {
    constructor(method: string, message?: string) {
        super("TableConstraints", method, message);
    }
}

/**
 * Primary key and foreign key constraints encode relationships between fields in
 * tables.
 *
 * Primary and foreign keys are informational only and are not enforced. Foreign
 * keys must reference a primary key in another table. This primary key is the
 * parent constraint of the foreign key and the table this primary key is on is
 * the parent table of the foreign key. Similarly, the foreign key is the child
 * constraint of its referenced primary key; the table of the foreign key is the
 * child table of the primary key.
 *
 * You can declare primary keys and foreign keys as part of the table
 * specification during table creation. You can also add or drop constraints on
 * existing tables.
 */
export class TableConstraintsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.CreateTableConstraint,
        @context context?: Context
    ): Promise<model.TableConstraint> {
        const path = "/api/2.1/unity-catalog/constraints";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.TableConstraint;
    }

    /**
     * Create a table constraint.
     *
     * Creates a new table constraint.
     *
     * For the table constraint creation to succeed, the user must satisfy both
     * of these conditions: - the user must have the **USE_CATALOG** privilege on
     * the table's parent catalog, the **USE_SCHEMA** privilege on the table's
     * parent schema, and be the owner of the table. - if the new constraint is a
     * __ForeignKeyConstraint__, the user must have the **USE_CATALOG** privilege
     * on the referenced parent table's catalog, the **USE_SCHEMA** privilege on
     * the referenced parent table's schema, and be the owner of the referenced
     * parent table.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateTableConstraint,
        @context context?: Context
    ): Promise<model.TableConstraint> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteTableConstraintRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.1/unity-catalog/constraints/${request.full_name}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a table constraint.
     *
     * Deletes a table constraint.
     *
     * For the table constraint deletion to succeed, the user must satisfy both
     * of these conditions: - the user must have the **USE_CATALOG** privilege on
     * the table's parent catalog, the **USE_SCHEMA** privilege on the table's
     * parent schema, and be the owner of the table. - if __cascade__ argument is
     * **true**, the user must have the following permissions on all of the child
     * tables: the **USE_CATALOG** privilege on the table's catalog, the
     * **USE_SCHEMA** privilege on the table's schema, and be the owner of the
     * table.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteTableConstraintRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
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
 * A table can be managed or external. From an API perspective, a __VIEW__ is a
 * particular kind of table (rather than a managed or external table).
 */
export class TablesService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
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
     * Delete a table.
     *
     * Deletes a table from the specified parent catalog and schema. The caller
     * must be the owner of the parent catalog, have the **USE_CATALOG**
     * privilege on the parent catalog and be the owner of the parent schema, or
     * be the owner of the table and have the **USE_CATALOG** privilege on the
     * parent catalog and the **USE_SCHEMA** privilege on the parent schema.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteTableRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
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
     * Get a table.
     *
     * Gets a table from the metastore for a specific catalog and schema. The
     * caller must be a metastore admin, be the owner of the table and have the
     * **USE_CATALOG** privilege on the parent catalog and the **USE_SCHEMA**
     * privilege on the parent schema, or be the owner of the table and have the
     * **SELECT** privilege on it as well.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetTableRequest,
        @context context?: Context
    ): Promise<model.TableInfo> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
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
     * List tables.
     *
     * Gets an array of all tables for the current metastore under the parent
     * catalog and schema. The caller must be a metastore admin or an owner of
     * (or have the **SELECT** privilege on) the table. For the latter case, the
     * caller must also be the owner or have the **USE_CATALOG** privilege on the
     * parent catalog and the **USE_SCHEMA** privilege on the parent schema.
     * There is no guarantee of a specific ordering of the elements in the array.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        request: model.ListTablesRequest,
        @context context?: Context
    ): AsyncIterable<model.TableInfo> {
        const response = (await this._list(request, context)).tables;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _listSummaries(
        request: model.ListSummariesRequest,
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

    /**
     * List table summaries.
     *
     * Gets an array of summaries for tables for a schema and catalog within the
     * metastore. The table summaries returned are either:
     *
     * * summaries for all tables (within the current metastore and parent
     * catalog and schema), when the user is a metastore admin, or: * summaries
     * for all tables and schemas (within the current metastore and parent
     * catalog) for which the user has ownership or the **SELECT** privilege on
     * the table and ownership or **USE_SCHEMA** privilege on the schema,
     * provided that the user also has ownership or the **USE_CATALOG** privilege
     * on the parent catalog.
     *
     * There is no guarantee of a specific ordering of the elements in the array.
     */
    @withLogContext(ExposedLoggers.SDK)
    async listSummaries(
        request: model.ListSummariesRequest,
        @context context?: Context
    ): Promise<model.ListTableSummariesResponse> {
        return await this._listSummaries(request, context);
    }
}
