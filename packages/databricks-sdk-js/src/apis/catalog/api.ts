/* eslint-disable @typescript-eslint/naming-convention */
// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

/**
 * These APIs allow you to manage Account Metastore Assignments, Account Metastores, Account Storage Credentials, Catalogs, Connections, External Locations, Functions, Grants, Metastores, Schemas, Storage Credentials, System Schemas, Table Constraints, Tables, Volumes, Workspace Bindings, etc.
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
        request: model.AccountsCreateMetastoreAssignment,
        @context context?: Context
    ): Promise<Array<model.CreateMetastoreAssignmentsResponseItem>> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/workspaces/${request.workspace_id}/metastores/${request.metastore_id}`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as Array<model.CreateMetastoreAssignmentsResponseItem>;
    }

    /**
     * Assigns a workspace to a metastore.
     *
     * Creates an assignment to a metastore for a workspace Please add a header
     * X-Databricks-Account-Console-API-Version: 2.0 to access this API.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.AccountsCreateMetastoreAssignment,
        @context context?: Context
    ): Promise<Array<model.CreateMetastoreAssignmentsResponseItem>> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteAccountMetastoreAssignmentRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/workspaces/${request.workspace_id}/metastores/${request.metastore_id}`;
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
     * no metastore. Please add a header
     * X-Databricks-Account-Console-API-Version: 2.0 to access this API.
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
    ): Promise<model.AccountsMetastoreAssignment> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/workspaces/${request.workspace_id}/metastore`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.AccountsMetastoreAssignment;
    }

    /**
     * Gets the metastore assignment for a workspace.
     *
     * Gets the metastore assignment, if any, for the workspace specified by ID.
     * If the workspace is assigned a metastore, the mappig will be returned. If
     * no metastore is assigned to the workspace, the assignment will not be
     * found and a 404 returned. Please add a header
     * X-Databricks-Account-Console-API-Version: 2.0 to access this API.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetAccountMetastoreAssignmentRequest,
        @context context?: Context
    ): Promise<model.AccountsMetastoreAssignment> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: model.ListAccountMetastoreAssignmentsRequest,
        @context context?: Context
    ): Promise<Array<model.MetastoreAssignment>> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/metastores/${request.metastore_id}/workspaces`;
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
     * given metastore. Please add a header
     * X-Databricks-Account-Console-API-Version: 2.0 to access this API
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
        request: model.AccountsUpdateMetastoreAssignment,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/workspaces/${request.workspace_id}/metastores/${request.metastore_id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Updates a metastore assignment to a workspaces.
     *
     * Updates an assignment to a metastore for a workspace. Currently, only the
     * default catalog may be updated. Please add a header
     * X-Databricks-Account-Console-API-Version: 2.0 to access this API.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.AccountsUpdateMetastoreAssignment,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
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
        request: model.AccountsCreateMetastore,
        @context context?: Context
    ): Promise<model.AccountsMetastoreInfo> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/metastores`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.AccountsMetastoreInfo;
    }

    /**
     * Create metastore.
     *
     * Creates a Unity Catalog metastore. Please add a header
     * X-Databricks-Account-Console-API-Version: 2.0 to access this API.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.AccountsCreateMetastore,
        @context context?: Context
    ): Promise<model.AccountsMetastoreInfo> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteAccountMetastoreRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/metastores/${request.metastore_id}`;
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
     * Deletes a Unity Catalog metastore for an account, both specified by ID.
     * Please add a header X-Databricks-Account-Console-API-Version: 2.0 to
     * access this API.
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
    ): Promise<model.AccountsMetastoreInfo> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/metastores/${request.metastore_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.AccountsMetastoreInfo;
    }

    /**
     * Get a metastore.
     *
     * Gets a Unity Catalog metastore from an account, both specified by ID.
     * Please add a header X-Databricks-Account-Console-API-Version: 2.0 to
     * access this API.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetAccountMetastoreRequest,
        @context context?: Context
    ): Promise<model.AccountsMetastoreInfo> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        @context context?: Context
    ): Promise<model.ListMetastoresResponse> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/metastores`;
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
     * ID. Please add a header X-Databricks-Account-Console-API-Version: 2.0 to
     * access this API.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        @context context?: Context
    ): Promise<model.ListMetastoresResponse> {
        return await this._list(context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: model.AccountsUpdateMetastore,
        @context context?: Context
    ): Promise<model.AccountsMetastoreInfo> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/metastores/${request.metastore_id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.AccountsMetastoreInfo;
    }

    /**
     * Update a metastore.
     *
     * Updates an existing Unity Catalog metastore. Please add a header
     * X-Databricks-Account-Console-API-Version: 2.0 to access this API.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.AccountsUpdateMetastore,
        @context context?: Context
    ): Promise<model.AccountsMetastoreInfo> {
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
        request: model.AccountsCreateStorageCredential,
        @context context?: Context
    ): Promise<model.StorageCredentialInfo> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/metastores/${request.metastore_id}/storage-credentials`;
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
        request: model.AccountsCreateStorageCredential,
        @context context?: Context
    ): Promise<model.StorageCredentialInfo> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteAccountStorageCredentialRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/metastores/${request.metastore_id}/storage-credentials/`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a storage credential.
     *
     * Deletes a storage credential from the metastore. The caller must be an
     * owner of the storage credential.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteAccountStorageCredentialRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetAccountStorageCredentialRequest,
        @context context?: Context
    ): Promise<model.StorageCredentialInfo> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/metastores/${request.metastore_id}/storage-credentials/`;
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
    ): Promise<model.ListStorageCredentialsResponse> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/metastores/${request.metastore_id}/storage-credentials`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListStorageCredentialsResponse;
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
    ): Promise<model.ListStorageCredentialsResponse> {
        return await this._list(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: model.AccountsUpdateStorageCredential,
        @context context?: Context
    ): Promise<model.StorageCredentialInfo> {
        const config = this.client.config;
        await config.ensureResolved();
        if (!config.accountId || !config.isAccountClient()) {
            throw new Error("invalid Databricks Account configuration");
        }

        const path = `/api/2.0/accounts/${config.accountId}/metastores/${request.metastore_id}/storage-credentials/`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.StorageCredentialInfo;
    }

    /**
     * Updates a storage credential.
     *
     * Updates a storage credential on the metastore. The caller must be the
     * owner of the storage credential. If the caller is a metastore admin, only
     * the __owner__ credential can be changed.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.AccountsUpdateStorageCredential,
        @context context?: Context
    ): Promise<model.StorageCredentialInfo> {
        return await this._update(request, context);
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

export class ConnectionsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Connections", method, message);
    }
}
export class ConnectionsError extends ApiError {
    constructor(method: string, message?: string) {
        super("Connections", method, message);
    }
}

/**
 * Connections allow for creating a connection to an external data source.
 *
 * A connection is an abstraction of an external data source that can be
 * connected from Databricks Compute. Creating a connection object is the first
 * step to managing external data sources within Unity Catalog, with the second
 * step being creating a data object (catalog, schema, or table) using the
 * connection. Data objects derived from a connection can be written to or read
 * from similar to other Unity Catalog data objects based on cloud storage. Users
 * may create different types of connections with each connection having a unique
 * set of configuration options to support credential management and other
 * settings.
 */
export class ConnectionsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.CreateConnection,
        @context context?: Context
    ): Promise<model.ConnectionInfo> {
        const path = "/api/2.1/unity-catalog/connections";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.ConnectionInfo;
    }

    /**
     * Create a connection.
     *
     * Creates a new connection
     *
     * Creates a new connection to an external data source. It allows users to
     * specify connection details and configurations for interaction with the
     * external server.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateConnection,
        @context context?: Context
    ): Promise<model.ConnectionInfo> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteConnectionRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.1/unity-catalog/connections/${request.name_arg}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a connection.
     *
     * Deletes the connection that matches the supplied name.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteConnectionRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetConnectionRequest,
        @context context?: Context
    ): Promise<model.ConnectionInfo> {
        const path = `/api/2.1/unity-catalog/connections/${request.name_arg}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ConnectionInfo;
    }

    /**
     * Get a connection.
     *
     * Gets a connection from it's name.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetConnectionRequest,
        @context context?: Context
    ): Promise<model.ConnectionInfo> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        @context context?: Context
    ): Promise<model.ListConnectionsResponse> {
        const path = "/api/2.1/unity-catalog/connections";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.ListConnectionsResponse;
    }

    /**
     * List connections.
     *
     * List all connections.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        @context context?: Context
    ): AsyncIterable<model.ConnectionInfo> {
        const response = (await this._list(context)).connections;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: model.UpdateConnection,
        @context context?: Context
    ): Promise<model.ConnectionInfo> {
        const path = `/api/2.1/unity-catalog/connections/${request.name_arg}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.ConnectionInfo;
    }

    /**
     * Update a connection.
     *
     * Updates the connection that matches the supplied name.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateConnection,
        @context context?: Context
    ): Promise<model.ConnectionInfo> {
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
    async *list(
        request: model.ListFunctionsRequest,
        @context context?: Context
    ): AsyncIterable<model.FunctionInfo> {
        const response = (await this._list(request, context)).functions;
        for (const v of response || []) {
            yield v;
        }
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
    private async _maintenance(
        request: model.UpdateAutoMaintenance,
        @context context?: Context
    ): Promise<model.UpdateAutoMaintenanceResponse> {
        const path = "/api/2.0/auto-maintenance/service";
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.UpdateAutoMaintenanceResponse;
    }

    /**
     * Enables or disables auto maintenance on the metastore.
     *
     * Enables or disables auto maintenance on the metastore.
     */
    @withLogContext(ExposedLoggers.SDK)
    async maintenance(
        request: model.UpdateAutoMaintenance,
        @context context?: Context
    ): Promise<model.UpdateAutoMaintenanceResponse> {
        return await this._maintenance(request, context);
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
     * * **AwsIamRole** for AWS credentials. * **AzureServicePrincipal** for
     * Azure credentials. * **AzureManagedIdentity** for Azure managed
     * credentials. * **DatabricksGcpServiceAccount** for GCP managed
     * credentials.
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
     * List credentials.
     *
     * Gets an array of storage credentials (as __StorageCredentialInfo__
     * objects). The array is limited to only those storage credentials the
     * caller has permission to access. If the caller is a metastore admin, all
     * storage credentials will be retrieved. There is no guarantee of a specific
     * ordering of the elements in the array.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        @context context?: Context
    ): AsyncIterable<model.StorageCredentialInfo> {
        const response = (await this._list(context)).storage_credentials;
        for (const v of response || []) {
            yield v;
        }
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

export class SystemSchemasRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("SystemSchemas", method, message);
    }
}
export class SystemSchemasError extends ApiError {
    constructor(method: string, message?: string) {
        super("SystemSchemas", method, message);
    }
}

/**
 * A system schema is a schema that lives within the system catalog. A system
 * schema may contain information about customer usage of Unity Catalog such as
 * audit-logs, billing-logs, lineage information, etc.
 */
export class SystemSchemasService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _disable(
        request: model.DisableRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.1/unity-catalog/metastores/${request.metastore_id}/systemschemas/${request.schema_name}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Disable a system schema.
     *
     * Disables the system schema and removes it from the system catalog. The
     * caller must be an account admin or a metastore admin.
     */
    @withLogContext(ExposedLoggers.SDK)
    async disable(
        request: model.DisableRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._disable(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _enable(
        request: model.EnableRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.1/unity-catalog/metastores/${request.metastore_id}/systemschemas/${request.schema_name}`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Enable a system schema.
     *
     * Enables the system schema and adds it to the system catalog. The caller
     * must be an account admin or a metastore admin.
     */
    @withLogContext(ExposedLoggers.SDK)
    async enable(
        request: model.EnableRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._enable(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: model.ListSystemSchemasRequest,
        @context context?: Context
    ): Promise<model.ListSystemSchemasResponse> {
        const path = `/api/2.1/unity-catalog/metastores/${request.metastore_id}/systemschemas`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListSystemSchemasResponse;
    }

    /**
     * List system schemas.
     *
     * Gets an array of system schemas for a metastore. The caller must be an
     * account admin or a metastore admin.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        request: model.ListSystemSchemasRequest,
        @context context?: Context
    ): AsyncIterable<model.SystemSchemaInfo> {
        const response = (await this._list(request, context)).schemas;
        for (const v of response || []) {
            yield v;
        }
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
        while (true) {
            const response = await this._list(request, context);
            if (
                context?.cancellationToken &&
                context?.cancellationToken.isCancellationRequested
            ) {
                break;
            }

            if (!response.tables || response.tables.length === 0) {
                break;
            }

            for (const v of response.tables) {
                yield v;
            }

            request.page_token = response.next_page_token;
            if (!response.next_page_token) {
                break;
            }
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
    async *listSummaries(
        request: model.ListSummariesRequest,
        @context context?: Context
    ): AsyncIterable<model.TableSummary> {
        while (true) {
            const response = await this._listSummaries(request, context);
            if (
                context?.cancellationToken &&
                context?.cancellationToken.isCancellationRequested
            ) {
                break;
            }

            if (!response.tables || response.tables.length === 0) {
                break;
            }

            for (const v of response.tables) {
                yield v;
            }

            request.page_token = response.next_page_token;
            if (!response.next_page_token) {
                break;
            }
        }
    }
}

export class VolumesRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Volumes", method, message);
    }
}
export class VolumesError extends ApiError {
    constructor(method: string, message?: string) {
        super("Volumes", method, message);
    }
}

/**
 * Volumes are a Unity Catalog (UC) capability for accessing, storing, governing,
 * organizing and processing files. Use cases include running machine learning on
 * unstructured data such as image, audio, video, or PDF files, organizing data
 * sets during the data exploration stages in data science, working with
 * libraries that require access to the local file system on cluster machines,
 * storing library and config files of arbitrary formats such as .whl or .txt
 * centrally and providing secure access across workspaces to it, or transforming
 * and querying non-tabular data files in ETL.
 */
export class VolumesService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.CreateVolumeRequestContent,
        @context context?: Context
    ): Promise<model.VolumeInfo> {
        const path = "/api/2.1/unity-catalog/volumes";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.VolumeInfo;
    }

    /**
     * Create a Volume.
     *
     * Creates a new volume.
     *
     * The user could create either an external volume or a managed volume. An
     * external volume will be created in the specified external location, while
     * a managed volume will be located in the default location which is
     * specified by the parent schema, or the parent catalog, or the Metastore.
     *
     * For the volume creation to succeed, the user must satisfy following
     * conditions: - The caller must be a metastore admin, or be the owner of the
     * parent catalog and schema, or have the **USE_CATALOG** privilege on the
     * parent catalog and the **USE_SCHEMA** privilege on the parent schema. -
     * The caller must have **CREATE VOLUME** privilege on the parent schema.
     *
     * For an external volume, following conditions also need to satisfy - The
     * caller must have **CREATE EXTERNAL VOLUME** privilege on the external
     * location. - There are no other tables, nor volumes existing in the
     * specified storage location. - The specified storage location is not under
     * the location of other tables, nor volumes, or catalogs or schemas.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateVolumeRequestContent,
        @context context?: Context
    ): Promise<model.VolumeInfo> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteVolumeRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.1/unity-catalog/volumes/${request.full_name_arg}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a Volume.
     *
     * Deletes a volume from the specified parent catalog and schema.
     *
     * The caller must be a metastore admin or an owner of the volume. For the
     * latter case, the caller must also be the owner or have the **USE_CATALOG**
     * privilege on the parent catalog and the **USE_SCHEMA** privilege on the
     * parent schema.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteVolumeRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: model.ListVolumesRequest,
        @context context?: Context
    ): Promise<model.ListVolumesResponseContent> {
        const path = "/api/2.1/unity-catalog/volumes";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListVolumesResponseContent;
    }

    /**
     * List Volumes.
     *
     * Gets an array of all volumes for the current metastore under the parent
     * catalog and schema.
     *
     * The returned volumes are filtered based on the privileges of the calling
     * user. For example, the metastore admin is able to list all the volumes. A
     * regular user needs to be the owner or have the **READ VOLUME** privilege
     * on the volume to recieve the volumes in the response. For the latter case,
     * the caller must also be the owner or have the **USE_CATALOG** privilege on
     * the parent catalog and the **USE_SCHEMA** privilege on the parent schema.
     *
     * There is no guarantee of a specific ordering of the elements in the array.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        request: model.ListVolumesRequest,
        @context context?: Context
    ): AsyncIterable<model.VolumeInfo> {
        const response = (await this._list(request, context)).volumes;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _read(
        request: model.ReadVolumeRequest,
        @context context?: Context
    ): Promise<model.VolumeInfo> {
        const path = `/api/2.1/unity-catalog/volumes/${request.full_name_arg}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.VolumeInfo;
    }

    /**
     * Get a Volume.
     *
     * Gets a volume from the metastore for a specific catalog and schema.
     *
     * The caller must be a metastore admin or an owner of (or have the **READ
     * VOLUME** privilege on) the volume. For the latter case, the caller must
     * also be the owner or have the **USE_CATALOG** privilege on the parent
     * catalog and the **USE_SCHEMA** privilege on the parent schema.
     */
    @withLogContext(ExposedLoggers.SDK)
    async read(
        request: model.ReadVolumeRequest,
        @context context?: Context
    ): Promise<model.VolumeInfo> {
        return await this._read(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: model.UpdateVolumeRequestContent,
        @context context?: Context
    ): Promise<model.VolumeInfo> {
        const path = `/api/2.1/unity-catalog/volumes/${request.full_name_arg}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.VolumeInfo;
    }

    /**
     * Update a Volume.
     *
     * Updates the specified volume under the specified parent catalog and
     * schema.
     *
     * The caller must be a metastore admin or an owner of the volume. For the
     * latter case, the caller must also be the owner or have the **USE_CATALOG**
     * privilege on the parent catalog and the **USE_SCHEMA** privilege on the
     * parent schema.
     *
     * Currently only the name, the owner or the comment of the volume could be
     * updated.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateVolumeRequestContent,
        @context context?: Context
    ): Promise<model.VolumeInfo> {
        return await this._update(request, context);
    }
}

export class WorkspaceBindingsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("WorkspaceBindings", method, message);
    }
}
export class WorkspaceBindingsError extends ApiError {
    constructor(method: string, message?: string) {
        super("WorkspaceBindings", method, message);
    }
}

/**
 * A catalog in Databricks can be configured as __OPEN__ or __ISOLATED__. An
 * __OPEN__ catalog can be accessed from any workspace, while an __ISOLATED__
 * catalog can only be access from a configured list of workspaces.
 *
 * A catalog's workspace bindings can be configured by a metastore admin or the
 * owner of the catalog.
 */
export class WorkspaceBindingsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetWorkspaceBindingRequest,
        @context context?: Context
    ): Promise<model.CurrentWorkspaceBindings> {
        const path = `/api/2.1/unity-catalog/workspace-bindings/catalogs/${request.name}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.CurrentWorkspaceBindings;
    }

    /**
     * Get catalog workspace bindings.
     *
     * Gets workspace bindings of the catalog. The caller must be a metastore
     * admin or an owner of the catalog.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetWorkspaceBindingRequest,
        @context context?: Context
    ): Promise<model.CurrentWorkspaceBindings> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: model.UpdateWorkspaceBindings,
        @context context?: Context
    ): Promise<model.CurrentWorkspaceBindings> {
        const path = `/api/2.1/unity-catalog/workspace-bindings/catalogs/${request.name}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.CurrentWorkspaceBindings;
    }

    /**
     * Update catalog workspace bindings.
     *
     * Updates workspace bindings of the catalog. The caller must be a metastore
     * admin or an owner of the catalog.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateWorkspaceBindings,
        @context context?: Context
    ): Promise<model.CurrentWorkspaceBindings> {
        return await this._update(request, context);
    }
}
