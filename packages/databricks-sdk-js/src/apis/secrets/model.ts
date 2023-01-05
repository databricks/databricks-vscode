/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
export interface AclItem {
    /**
     * The permission level applied to the principal.
     */
    permission: AclPermission;
    /**
     * The principal in which the permission is applied.
     */
    principal: string;
}

export type AclPermission = "MANAGE" | "READ" | "WRITE";

export interface AzureKeyVaultSecretScopeMetadata {
    /**
     * The DNS of the KeyVault
     */
    dns_name: string;
    /**
     * The resource id of the azure KeyVault that user wants to associate the
     * scope with.
     */
    resource_id: string;
}

export interface CreateScope {
    /**
     * The principal that is initially granted `MANAGE` permission to the created
     * scope.
     */
    initial_manage_principal?: string;
    /**
     * The metadata for the secret scope if the type is `AZURE_KEYVAULT`
     */
    keyvault_metadata?: AzureKeyVaultSecretScopeMetadata;
    /**
     * Scope name requested by the user. Scope names are unique.
     */
    scope: string;
    /**
     * The backend type the scope will be created with. If not specified, will
     * default to `DATABRICKS`
     */
    scope_backend_type?: ScopeBackendType;
}

export interface DeleteAcl {
    /**
     * The principal to remove an existing ACL from.
     */
    principal: string;
    /**
     * The name of the scope to remove permissions from.
     */
    scope: string;
}

export interface DeleteScope {
    /**
     * Name of the scope to delete.
     */
    scope: string;
}

export interface DeleteSecret {
    /**
     * Name of the secret to delete.
     */
    key: string;
    /**
     * The name of the scope that contains the secret to delete.
     */
    scope: string;
}

/**
 * Get secret ACL details
 */
export interface GetAcl {
    /**
     * The principal to fetch ACL information for.
     */
    principal: string;
    /**
     * The name of the scope to fetch ACL information from.
     */
    scope: string;
}

/**
 * Lists ACLs
 */
export interface ListAcls {
    /**
     * The name of the scope to fetch ACL information from.
     */
    scope: string;
}

export interface ListAclsResponse {
    /**
     * The associated ACLs rule applied to principals in the given scope.
     */
    items?: Array<AclItem>;
}

export interface ListScopesResponse {
    /**
     * The available secret scopes.
     */
    scopes?: Array<SecretScope>;
}

/**
 * List secret keys
 */
export interface ListSecrets {
    /**
     * The name of the scope to list secrets within.
     */
    scope: string;
}

export interface ListSecretsResponse {
    /**
     * Metadata information of all secrets contained within the given scope.
     */
    secrets?: Array<SecretMetadata>;
}

export interface PutAcl {
    /**
     * The permission level applied to the principal.
     */
    permission: AclPermission;
    /**
     * The principal in which the permission is applied.
     */
    principal: string;
    /**
     * The name of the scope to apply permissions to.
     */
    scope: string;
}

export interface PutSecret {
    /**
     * If specified, value will be stored as bytes.
     */
    bytes_value?: string;
    /**
     * A unique name to identify the secret.
     */
    key: string;
    /**
     * The name of the scope to which the secret will be associated with.
     */
    scope: string;
    /**
     * If specified, note that the value will be stored in UTF-8 (MB4) form.
     */
    string_value?: string;
}

export type ScopeBackendType = "AZURE_KEYVAULT" | "DATABRICKS";

export interface SecretMetadata {
    /**
     * A unique name to identify the secret.
     */
    key?: string;
    /**
     * The last updated timestamp (in milliseconds) for the secret.
     */
    last_updated_timestamp?: number;
}

export interface SecretScope {
    /**
     * The type of secret scope backend.
     */
    backend_type?: ScopeBackendType;
    /**
     * The metadata for the secret scope if the type is `AZURE_KEYVAULT`
     */
    keyvault_metadata?: AzureKeyVaultSecretScopeMetadata;
    /**
     * A unique name to identify the secret scope.
     */
    name?: string;
}

export interface EmptyResponse {}
