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

export interface CreateCredentials {
    /**
     * Git provider. This field is case-insensitive. The available Git providers
     * are gitHub, bitbucketCloud, gitLab, azureDevOpsServices, gitHubEnterprise,
     * bitbucketServer, gitLabEnterpriseEdition and awsCodeCommit.
     */
    git_provider: string;
    /**
     * Git username.
     */
    git_username?: string;
    /**
     * The personal access token used to authenticate to the corresponding Git
     * provider.
     */
    personal_access_token?: string;
}

export interface CreateCredentialsResponse {
    /**
     * ID of the credential object in the workspace.
     */
    credential_id?: number;
    /**
     * Git provider. This field is case-insensitive. The available Git providers
     * are gitHub, bitbucketCloud, gitLab, azureDevOpsServices, gitHubEnterprise,
     * bitbucketServer, gitLabEnterpriseEdition and awsCodeCommit.
     */
    git_provider?: string;
    /**
     * Git username.
     */
    git_username?: string;
}

export interface CreateRepo {
    /**
     * Desired path for the repo in the workspace. Must be in the format
     * /Repos/{folder}/{repo-name}.
     */
    path?: string;
    /**
     * Git provider. This field is case-insensitive. The available Git providers
     * are gitHub, bitbucketCloud, gitLab, azureDevOpsServices, gitHubEnterprise,
     * bitbucketServer, gitLabEnterpriseEdition and awsCodeCommit.
     */
    provider: string;
    /**
     * If specified, the repo will be created with sparse checkout enabled. You
     * cannot enable/disable sparse checkout after the repo is created.
     */
    sparse_checkout?: SparseCheckout;
    /**
     * URL of the Git repository to be linked.
     */
    url: string;
}

export interface CreateScope {
    /**
     * The metadata for the secret scope if the type is `AZURE_KEYVAULT`
     */
    backend_azure_keyvault?: AzureKeyVaultSecretScopeMetadata;
    /**
     * The principal that is initially granted `MANAGE` permission to the created
     * scope.
     */
    initial_manage_principal?: string;
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

export interface CredentialInfo {
    /**
     * ID of the credential object in the workspace.
     */
    credential_id?: number;
    /**
     * Git provider. This field is case-insensitive. The available Git providers
     * are gitHub, bitbucketCloud, gitLab, azureDevOpsServices, gitHubEnterprise,
     * bitbucketServer, gitLabEnterpriseEdition and awsCodeCommit.
     */
    git_provider?: string;
    /**
     * Git username.
     */
    git_username?: string;
}

export interface Delete {
    /**
     * The absolute path of the notebook or directory.
     */
    path: string;
    /**
     * The flag that specifies whether to delete the object recursively. It is
     * `false` by default. Please note this deleting directory is not atomic. If
     * it fails in the middle, some of objects under this directory may be
     * deleted and cannot be undone.
     */
    recursive?: boolean;
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

/**
 * Delete a credential
 */
export interface DeleteGitCredentialRequest {
    /**
     * The ID for the corresponding credential to access.
     */
    credential_id: number;
}

/**
 * Delete a repo
 */
export interface DeleteRepoRequest {
    /**
     * The ID for the corresponding repo to access.
     */
    repo_id: number;
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

export type ExportFormat =
    | "AUTO"
    | "DBC"
    | "HTML"
    | "JUPYTER"
    | "R_MARKDOWN"
    | "SOURCE";

/**
 * Export a workspace object
 */
export interface ExportRequest {
    /**
     * This specifies the format of the exported file. By default, this is
     * `SOURCE`.
     *
     * The value is case sensitive.
     *
     * - `SOURCE`: The notebook is exported as source code. - `HTML`: The
     * notebook is exported as an HTML file. - `JUPYTER`: The notebook is
     * exported as a Jupyter/IPython Notebook file. - `DBC`: The notebook is
     * exported in Databricks archive format. - `R_MARKDOWN`: The notebook is
     * exported to R Markdown format.
     */
    format?: ExportFormat;
    /**
     * The absolute path of the object or directory. Exporting a directory is
     * only supported for the `DBC` and `SOURCE` format.
     */
    path: string;
}

export interface ExportResponse {
    /**
     * The base64-encoded content. If the limit (10MB) is exceeded, exception
     * with error code **MAX_NOTEBOOK_SIZE_EXCEEDED** is thrown.
     */
    content?: string;
}

/**
 * Get secret ACL details
 */
export interface GetAclRequest {
    /**
     * The principal to fetch ACL information for.
     */
    principal: string;
    /**
     * The name of the scope to fetch ACL information from.
     */
    scope: string;
}

export interface GetCredentialsResponse {
    credentials?: Array<CredentialInfo>;
}

/**
 * Get a credential entry
 */
export interface GetGitCredentialRequest {
    /**
     * The ID for the corresponding credential to access.
     */
    credential_id: number;
}

/**
 * Get a repo
 */
export interface GetRepoRequest {
    /**
     * The ID for the corresponding repo to access.
     */
    repo_id: number;
}

/**
 * Get status
 */
export interface GetStatusRequest {
    /**
     * The absolute path of the notebook or directory.
     */
    path: string;
}

export interface Import {
    /**
     * The base64-encoded content. This has a limit of 10 MB.
     *
     * If the limit (10MB) is exceeded, exception with error code
     * **MAX_NOTEBOOK_SIZE_EXCEEDED** is thrown. This parameter might be absent,
     * and instead a posted file is used.
     */
    content?: string;
    /**
     * This specifies the format of the file to be imported.
     *
     * The value is case sensitive.
     *
     * - `AUTO`: The item is imported depending on an analysis of the item's
     * extension and the header content provided in the request. If the item is
     * imported as a notebook, then the item's extension is automatically
     * removed. - `SOURCE`: The notebook is imported as source code. - `HTML`:
     * The notebook is imported as an HTML file. - `JUPYTER`: The notebook is
     * imported as a Jupyter/IPython Notebook file. - `DBC`: The notebook is
     * imported in Databricks archive format. Required for directories. -
     * `R_MARKDOWN`: The notebook is imported from R Markdown format.
     */
    format?: ImportFormat;
    /**
     * The language of the object. This value is set only if the object type is
     * `NOTEBOOK`.
     */
    language?: Language;
    /**
     * The flag that specifies whether to overwrite existing object. It is
     * `false` by default. For `DBC` format, `overwrite` is not supported since
     * it may contain a directory.
     */
    overwrite?: boolean;
    /**
     * The absolute path of the object or directory. Importing a directory is
     * only supported for the `DBC` format.
     */
    path: string;
}

/**
 * This specifies the format of the file to be imported.
 *
 * The value is case sensitive.
 *
 * - `AUTO`: The item is imported depending on an analysis of the item's
 * extension and the header content provided in the request. If the item is
 * imported as a notebook, then the item's extension is automatically removed. -
 * `SOURCE`: The notebook is imported as source code. - `HTML`: The notebook is
 * imported as an HTML file. - `JUPYTER`: The notebook is imported as a
 * Jupyter/IPython Notebook file. - `DBC`: The notebook is imported in Databricks
 * archive format. Required for directories. - `R_MARKDOWN`: The notebook is
 * imported from R Markdown format.
 */
export type ImportFormat =
    | "AUTO"
    | "DBC"
    | "HTML"
    | "JUPYTER"
    | "R_MARKDOWN"
    | "SOURCE";

/**
 * The language of the object. This value is set only if the object type is
 * `NOTEBOOK`.
 */
export type Language = "PYTHON" | "R" | "SCALA" | "SQL";

/**
 * Lists ACLs
 */
export interface ListAclsRequest {
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

/**
 * Get repos
 */
export interface ListReposRequest {
    /**
     * Token used to get the next page of results. If not specified, returns the
     * first page of results as well as a next page token if there are more
     * results.
     */
    next_page_token?: string;
    /**
     * Filters repos that have paths starting with the given path prefix.
     */
    path_prefix?: string;
}

export interface ListReposResponse {
    /**
     * Token that can be specified as a query parameter to the GET /repos
     * endpoint to retrieve the next page of results.
     */
    next_page_token?: string;
    repos?: Array<RepoInfo>;
}

export interface ListResponse {
    /**
     * List of objects.
     */
    objects?: Array<ObjectInfo>;
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
export interface ListSecretsRequest {
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

/**
 * List contents
 */
export interface ListWorkspaceRequest {
    /**
     * UTC timestamp in milliseconds
     */
    notebooks_modified_after?: number;
    /**
     * The absolute path of the notebook or directory.
     */
    path: string;
}

export interface Mkdirs {
    /**
     * The absolute path of the directory. If the parent directories do not
     * exist, it will also create them. If the directory already exists, this
     * command will do nothing and succeed.
     */
    path: string;
}

export interface ObjectInfo {
    /**
     * Only applicable to files. The creation UTC timestamp.
     */
    created_at?: number;
    /**
     * The language of the object. This value is set only if the object type is
     * `NOTEBOOK`.
     */
    language?: Language;
    /**
     * Only applicable to files, the last modified UTC timestamp.
     */
    modified_at?: number;
    /**
     * Unique identifier for the object.
     */
    object_id?: number;
    /**
     * The type of the object in workspace.
     *
     * - `NOTEBOOK`: document that contains runnable code, visualizations, and
     * explanatory text. - `DIRECTORY`: directory - `LIBRARY`: library - `FILE`:
     * file - `REPO`: repository
     */
    object_type?: ObjectType;
    /**
     * The absolute path of the object.
     */
    path?: string;
    /**
     * Only applicable to files. The file size in bytes can be returned.
     */
    size?: number;
}

/**
 * The type of the object in workspace.
 *
 * - `NOTEBOOK`: document that contains runnable code, visualizations, and
 * explanatory text. - `DIRECTORY`: directory - `LIBRARY`: library - `FILE`: file
 * - `REPO`: repository
 */
export type ObjectType = "DIRECTORY" | "FILE" | "LIBRARY" | "NOTEBOOK" | "REPO";

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

export interface RepoInfo {
    /**
     * Branch that the local version of the repo is checked out to.
     */
    branch?: string;
    /**
     * SHA-1 hash representing the commit ID of the current HEAD of the repo.
     */
    head_commit_id?: string;
    /**
     * ID of the repo object in the workspace.
     */
    id?: number;
    /**
     * Desired path for the repo in the workspace. Must be in the format
     * /Repos/{folder}/{repo-name}.
     */
    path?: string;
    /**
     * Git provider. This field is case-insensitive. The available Git providers
     * are gitHub, bitbucketCloud, gitLab, azureDevOpsServices, gitHubEnterprise,
     * bitbucketServer, gitLabEnterpriseEdition and awsCodeCommit.
     */
    provider?: string;
    sparse_checkout?: SparseCheckout;
    /**
     * URL of the Git repository to be linked.
     */
    url?: string;
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

export interface SparseCheckout {
    /**
     * List of patterns to include for sparse checkout.
     */
    patterns?: Array<string>;
}

/**
 * Sparse checkout cone pattern, see [cone mode handling] for details.
 *
 * [cone mode handling]: https://git-scm.com/docs/git-sparse-checkout#_internalscone_mode_handling
 */

export interface SparseCheckoutUpdate {
    /**
     * List of patterns to include for sparse checkout.
     */
    patterns?: Array<string>;
}

export interface UpdateCredentials {
    /**
     * The ID for the corresponding credential to access.
     */
    credential_id: number;
    /**
     * Git provider. This field is case-insensitive. The available Git providers
     * are gitHub, bitbucketCloud, gitLab, azureDevOpsServices, gitHubEnterprise,
     * bitbucketServer, gitLabEnterpriseEdition and awsCodeCommit.
     */
    git_provider?: string;
    /**
     * Git username.
     */
    git_username?: string;
    /**
     * The personal access token used to authenticate to the corresponding Git
     * provider.
     */
    personal_access_token?: string;
}

export interface UpdateRepo {
    /**
     * Branch that the local version of the repo is checked out to.
     */
    branch?: string;
    /**
     * The ID for the corresponding repo to access.
     */
    repo_id: number;
    /**
     * If specified, update the sparse checkout settings. The update will fail if
     * sparse checkout is not enabled for the repo.
     */
    sparse_checkout?: SparseCheckoutUpdate;
    /**
     * Tag that the local version of the repo is checked out to. Updating the
     * repo to a tag puts the repo in a detached HEAD state. Before committing
     * new changes, you must update the repo to a branch instead of the detached
     * HEAD.
     */
    tag?: string;
}
