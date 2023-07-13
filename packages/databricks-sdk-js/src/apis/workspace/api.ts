/* eslint-disable @typescript-eslint/naming-convention */
// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

/**
 * These APIs allow you to manage Git Credentials, Repos, Secrets, Workspace, etc.
 */

import {ApiClient} from "../../api-client";
import * as workspace from "./model";
import {EmptyResponse} from "../../types";
import Time from "../../retries/Time";
import retry from "../../retries/retries";
import {CancellationToken} from "../../types";
import {ApiError, ApiRetriableError} from "../apiError";
import {context, Context} from "../../context";
import {ExposedLoggers, withLogContext} from "../../logging";
import {Waiter, asWaiter} from "../../wait";

export class GitCredentialsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("GitCredentials", method, message);
    }
}
export class GitCredentialsError extends ApiError {
    constructor(method: string, message?: string) {
        super("GitCredentials", method, message);
    }
}

/**
 * Registers personal access token for Databricks to do operations on behalf of
 * the user.
 *
 * See [more info].
 *
 * [more info]: https://docs.databricks.com/repos/get-access-tokens-from-git-provider.html
 */
export class GitCredentialsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: workspace.CreateCredentials,
        @context context?: Context
    ): Promise<workspace.CreateCredentialsResponse> {
        const path = "/api/2.0/git-credentials";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as workspace.CreateCredentialsResponse;
    }

    /**
     * Create a credential entry.
     *
     * Creates a Git credential entry for the user. Only one Git credential per
     * user is supported, so any attempts to create credentials if an entry
     * already exists will fail. Use the PATCH endpoint to update existing
     * credentials, or the DELETE endpoint to delete existing credentials.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: workspace.CreateCredentials,
        @context context?: Context
    ): Promise<workspace.CreateCredentialsResponse> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: workspace.DeleteGitCredentialRequest,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = `/api/2.0/git-credentials/${request.credential_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Delete a credential.
     *
     * Deletes the specified Git credential.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: workspace.DeleteGitCredentialRequest,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: workspace.GetGitCredentialRequest,
        @context context?: Context
    ): Promise<workspace.CredentialInfo> {
        const path = `/api/2.0/git-credentials/${request.credential_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as workspace.CredentialInfo;
    }

    /**
     * Get a credential entry.
     *
     * Gets the Git credential with the specified credential ID.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: workspace.GetGitCredentialRequest,
        @context context?: Context
    ): Promise<workspace.CredentialInfo> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        @context context?: Context
    ): Promise<workspace.GetCredentialsResponse> {
        const path = "/api/2.0/git-credentials";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as workspace.GetCredentialsResponse;
    }

    /**
     * Get Git credentials.
     *
     * Lists the calling user's Git credentials. One credential per user is
     * supported.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        @context context?: Context
    ): AsyncIterable<workspace.CredentialInfo> {
        const response = (await this._list(context)).credentials;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: workspace.UpdateCredentials,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = `/api/2.0/git-credentials/${request.credential_id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Update a credential.
     *
     * Updates the specified Git credential.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: workspace.UpdateCredentials,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._update(request, context);
    }
}

export class ReposRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Repos", method, message);
    }
}
export class ReposError extends ApiError {
    constructor(method: string, message?: string) {
        super("Repos", method, message);
    }
}

/**
 * The Repos API allows users to manage their git repos. Users can use the API to
 * access all repos that they have manage permissions on.
 *
 * Databricks Repos is a visual Git client in Databricks. It supports common Git
 * operations such a cloning a repository, committing and pushing, pulling,
 * branch management, and visual comparison of diffs when committing.
 *
 * Within Repos you can develop code in notebooks or other files and follow data
 * science and engineering code development best practices using Git for version
 * control, collaboration, and CI/CD.
 */
export class ReposService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: workspace.CreateRepo,
        @context context?: Context
    ): Promise<workspace.RepoInfo> {
        const path = "/api/2.0/repos";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as workspace.RepoInfo;
    }

    /**
     * Create a repo.
     *
     * Creates a repo in the workspace and links it to the remote Git repo
     * specified. Note that repos created programmatically must be linked to a
     * remote Git repo, unlike repos created in the browser.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: workspace.CreateRepo,
        @context context?: Context
    ): Promise<workspace.RepoInfo> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: workspace.DeleteRepoRequest,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = `/api/2.0/repos/${request.repo_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Delete a repo.
     *
     * Deletes the specified repo.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: workspace.DeleteRepoRequest,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: workspace.GetRepoRequest,
        @context context?: Context
    ): Promise<workspace.RepoInfo> {
        const path = `/api/2.0/repos/${request.repo_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as workspace.RepoInfo;
    }

    /**
     * Get a repo.
     *
     * Returns the repo with the given repo ID.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: workspace.GetRepoRequest,
        @context context?: Context
    ): Promise<workspace.RepoInfo> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: workspace.ListReposRequest,
        @context context?: Context
    ): Promise<workspace.ListReposResponse> {
        const path = "/api/2.0/repos";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as workspace.ListReposResponse;
    }

    /**
     * Get repos.
     *
     * Returns repos that the calling user has Manage permissions on. Results are
     * paginated with each page containing twenty repos.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        request: workspace.ListReposRequest,
        @context context?: Context
    ): AsyncIterable<workspace.RepoInfo> {
        while (true) {
            const response = await this._list(request, context);
            if (
                context?.cancellationToken &&
                context?.cancellationToken.isCancellationRequested
            ) {
                break;
            }

            if (!response.repos || response.repos.length === 0) {
                break;
            }

            for (const v of response.repos) {
                yield v;
            }

            request.next_page_token = response.next_page_token;
            if (!response.next_page_token) {
                break;
            }
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: workspace.UpdateRepo,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = `/api/2.0/repos/${request.repo_id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Update a repo.
     *
     * Updates the repo to a different branch or tag, or updates the repo to the
     * latest commit on the same branch.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: workspace.UpdateRepo,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._update(request, context);
    }
}

export class SecretsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Secrets", method, message);
    }
}
export class SecretsError extends ApiError {
    constructor(method: string, message?: string) {
        super("Secrets", method, message);
    }
}

/**
 * The Secrets API allows you to manage secrets, secret scopes, and access
 * permissions.
 *
 * Sometimes accessing data requires that you authenticate to external data
 * sources through JDBC. Instead of directly entering your credentials into a
 * notebook, use Databricks secrets to store your credentials and reference them
 * in notebooks and jobs.
 *
 * Administrators, secret creators, and users granted permission can read
 * Databricks secrets. While Databricks makes an effort to redact secret values
 * that might be displayed in notebooks, it is not possible to prevent such users
 * from reading secrets.
 */
export class SecretsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _createScope(
        request: workspace.CreateScope,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = "/api/2.0/secrets/scopes/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Create a new secret scope.
     *
     * The scope name must consist of alphanumeric characters, dashes,
     * underscores, and periods, and may not exceed 128 characters. The maximum
     * number of scopes in a workspace is 100.
     */
    @withLogContext(ExposedLoggers.SDK)
    async createScope(
        request: workspace.CreateScope,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._createScope(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _deleteAcl(
        request: workspace.DeleteAcl,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = "/api/2.0/secrets/acls/delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Delete an ACL.
     *
     * Deletes the given ACL on the given scope.
     *
     * Users must have the `MANAGE` permission to invoke this API. Throws
     * `RESOURCE_DOES_NOT_EXIST` if no such secret scope, principal, or ACL
     * exists. Throws `PERMISSION_DENIED` if the user does not have permission to
     * make this API call.
     */
    @withLogContext(ExposedLoggers.SDK)
    async deleteAcl(
        request: workspace.DeleteAcl,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._deleteAcl(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _deleteScope(
        request: workspace.DeleteScope,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = "/api/2.0/secrets/scopes/delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Delete a secret scope.
     *
     * Deletes a secret scope.
     *
     * Throws `RESOURCE_DOES_NOT_EXIST` if the scope does not exist. Throws
     * `PERMISSION_DENIED` if the user does not have permission to make this API
     * call.
     */
    @withLogContext(ExposedLoggers.SDK)
    async deleteScope(
        request: workspace.DeleteScope,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._deleteScope(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _deleteSecret(
        request: workspace.DeleteSecret,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = "/api/2.0/secrets/delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Delete a secret.
     *
     * Deletes the secret stored in this secret scope. You must have `WRITE` or
     * `MANAGE` permission on the secret scope.
     *
     * Throws `RESOURCE_DOES_NOT_EXIST` if no such secret scope or secret exists.
     * Throws `PERMISSION_DENIED` if the user does not have permission to make
     * this API call.
     */
    @withLogContext(ExposedLoggers.SDK)
    async deleteSecret(
        request: workspace.DeleteSecret,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._deleteSecret(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _getAcl(
        request: workspace.GetAclRequest,
        @context context?: Context
    ): Promise<workspace.AclItem> {
        const path = "/api/2.0/secrets/acls/get";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as workspace.AclItem;
    }

    /**
     * Get secret ACL details.
     *
     * Gets the details about the given ACL, such as the group and permission.
     * Users must have the `MANAGE` permission to invoke this API.
     *
     * Throws `RESOURCE_DOES_NOT_EXIST` if no such secret scope exists. Throws
     * `PERMISSION_DENIED` if the user does not have permission to make this API
     * call.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getAcl(
        request: workspace.GetAclRequest,
        @context context?: Context
    ): Promise<workspace.AclItem> {
        return await this._getAcl(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _listAcls(
        request: workspace.ListAclsRequest,
        @context context?: Context
    ): Promise<workspace.ListAclsResponse> {
        const path = "/api/2.0/secrets/acls/list";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as workspace.ListAclsResponse;
    }

    /**
     * Lists ACLs.
     *
     * List the ACLs for a given secret scope. Users must have the `MANAGE`
     * permission to invoke this API.
     *
     * Throws `RESOURCE_DOES_NOT_EXIST` if no such secret scope exists. Throws
     * `PERMISSION_DENIED` if the user does not have permission to make this API
     * call.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *listAcls(
        request: workspace.ListAclsRequest,
        @context context?: Context
    ): AsyncIterable<workspace.AclItem> {
        const response = (await this._listAcls(request, context)).items;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _listScopes(
        @context context?: Context
    ): Promise<workspace.ListScopesResponse> {
        const path = "/api/2.0/secrets/scopes/list";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as workspace.ListScopesResponse;
    }

    /**
     * List all scopes.
     *
     * Lists all secret scopes available in the workspace.
     *
     * Throws `PERMISSION_DENIED` if the user does not have permission to make
     * this API call.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *listScopes(
        @context context?: Context
    ): AsyncIterable<workspace.SecretScope> {
        const response = (await this._listScopes(context)).scopes;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _listSecrets(
        request: workspace.ListSecretsRequest,
        @context context?: Context
    ): Promise<workspace.ListSecretsResponse> {
        const path = "/api/2.0/secrets/list";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as workspace.ListSecretsResponse;
    }

    /**
     * List secret keys.
     *
     * Lists the secret keys that are stored at this scope. This is a
     * metadata-only operation; secret data cannot be retrieved using this API.
     * Users need the READ permission to make this call.
     *
     * The lastUpdatedTimestamp returned is in milliseconds since epoch. Throws
     * `RESOURCE_DOES_NOT_EXIST` if no such secret scope exists. Throws
     * `PERMISSION_DENIED` if the user does not have permission to make this API
     * call.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *listSecrets(
        request: workspace.ListSecretsRequest,
        @context context?: Context
    ): AsyncIterable<workspace.SecretMetadata> {
        const response = (await this._listSecrets(request, context)).secrets;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _putAcl(
        request: workspace.PutAcl,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = "/api/2.0/secrets/acls/put";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Create/update an ACL.
     *
     * Creates or overwrites the Access Control List (ACL) associated with the
     * given principal (user or group) on the specified scope point.
     *
     * In general, a user or group will use the most powerful permission
     * available to them, and permissions are ordered as follows:
     *
     * * `MANAGE` - Allowed to change ACLs, and read and write to this secret
     * scope. * `WRITE` - Allowed to read and write to this secret scope. *
     * `READ` - Allowed to read this secret scope and list what secrets are
     * available.
     *
     * Note that in general, secret values can only be read from within a command
     * on a cluster (for example, through a notebook). There is no API to read
     * the actual secret value material outside of a cluster. However, the user's
     * permission will be applied based on who is executing the command, and they
     * must have at least READ permission.
     *
     * Users must have the `MANAGE` permission to invoke this API.
     *
     * The principal is a user or group name corresponding to an existing
     * Databricks principal to be granted or revoked access.
     *
     * Throws `RESOURCE_DOES_NOT_EXIST` if no such secret scope exists. Throws
     * `RESOURCE_ALREADY_EXISTS` if a permission for the principal already
     * exists. Throws `INVALID_PARAMETER_VALUE` if the permission or principal is
     * invalid. Throws `PERMISSION_DENIED` if the user does not have permission
     * to make this API call.
     */
    @withLogContext(ExposedLoggers.SDK)
    async putAcl(
        request: workspace.PutAcl,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._putAcl(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _putSecret(
        request: workspace.PutSecret,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = "/api/2.0/secrets/put";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Add a secret.
     *
     * Inserts a secret under the provided scope with the given name. If a secret
     * already exists with the same name, this command overwrites the existing
     * secret's value. The server encrypts the secret using the secret scope's
     * encryption settings before storing it.
     *
     * You must have `WRITE` or `MANAGE` permission on the secret scope. The
     * secret key must consist of alphanumeric characters, dashes, underscores,
     * and periods, and cannot exceed 128 characters. The maximum allowed secret
     * value size is 128 KB. The maximum number of secrets in a given scope is
     * 1000.
     *
     * The input fields "string_value" or "bytes_value" specify the type of the
     * secret, which will determine the value returned when the secret value is
     * requested. Exactly one must be specified.
     *
     * Throws `RESOURCE_DOES_NOT_EXIST` if no such secret scope exists. Throws
     * `RESOURCE_LIMIT_EXCEEDED` if maximum number of secrets in scope is
     * exceeded. Throws `INVALID_PARAMETER_VALUE` if the key name or value length
     * is invalid. Throws `PERMISSION_DENIED` if the user does not have
     * permission to make this API call.
     */
    @withLogContext(ExposedLoggers.SDK)
    async putSecret(
        request: workspace.PutSecret,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._putSecret(request, context);
    }
}

export class WorkspaceRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Workspace", method, message);
    }
}
export class WorkspaceError extends ApiError {
    constructor(method: string, message?: string) {
        super("Workspace", method, message);
    }
}

/**
 * The Workspace API allows you to list, import, export, and delete notebooks and
 * folders.
 *
 * A notebook is a web-based interface to a document that contains runnable code,
 * visualizations, and explanatory text.
 */
export class WorkspaceService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: workspace.Delete,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = "/api/2.0/workspace/delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Delete a workspace object.
     *
     * Deletes an object or a directory (and optionally recursively deletes all
     * objects in the directory). * If `path` does not exist, this call returns
     * an error `RESOURCE_DOES_NOT_EXIST`. * If `path` is a non-empty directory
     * and `recursive` is set to `false`, this call returns an error
     * `DIRECTORY_NOT_EMPTY`.
     *
     * Object deletion cannot be undone and deleting a directory recursively is
     * not atomic.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: workspace.Delete,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _export(
        request: workspace.ExportRequest,
        @context context?: Context
    ): Promise<workspace.ExportResponse> {
        const path = "/api/2.0/workspace/export";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as workspace.ExportResponse;
    }

    /**
     * Export a workspace object.
     *
     * Exports an object or the contents of an entire directory.
     *
     * If `path` does not exist, this call returns an error
     * `RESOURCE_DOES_NOT_EXIST`.
     *
     * If the exported data would exceed size limit, this call returns
     * `MAX_NOTEBOOK_SIZE_EXCEEDED`. Currently, this API does not support
     * exporting a library.
     */
    @withLogContext(ExposedLoggers.SDK)
    async export(
        request: workspace.ExportRequest,
        @context context?: Context
    ): Promise<workspace.ExportResponse> {
        return await this._export(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _getStatus(
        request: workspace.GetStatusRequest,
        @context context?: Context
    ): Promise<workspace.ObjectInfo> {
        const path = "/api/2.0/workspace/get-status";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as workspace.ObjectInfo;
    }

    /**
     * Get status.
     *
     * Gets the status of an object or a directory. If `path` does not exist,
     * this call returns an error `RESOURCE_DOES_NOT_EXIST`.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getStatus(
        request: workspace.GetStatusRequest,
        @context context?: Context
    ): Promise<workspace.ObjectInfo> {
        return await this._getStatus(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _import(
        request: workspace.Import,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = "/api/2.0/workspace/import";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Import a workspace object.
     *
     * Imports a workspace object (for example, a notebook or file) or the
     * contents of an entire directory. If `path` already exists and `overwrite`
     * is set to `false`, this call returns an error `RESOURCE_ALREADY_EXISTS`.
     * One can only use `DBC` format to import a directory.
     */
    @withLogContext(ExposedLoggers.SDK)
    async import(
        request: workspace.Import,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._import(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: workspace.ListWorkspaceRequest,
        @context context?: Context
    ): Promise<workspace.ListResponse> {
        const path = "/api/2.0/workspace/list";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as workspace.ListResponse;
    }

    /**
     * List contents.
     *
     * Lists the contents of a directory, or the object if it is not a directory.
     * If the input path does not exist, this call returns an error
     * `RESOURCE_DOES_NOT_EXIST`.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        request: workspace.ListWorkspaceRequest,
        @context context?: Context
    ): AsyncIterable<workspace.ObjectInfo> {
        const response = (await this._list(request, context)).objects;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _mkdirs(
        request: workspace.Mkdirs,
        @context context?: Context
    ): Promise<EmptyResponse> {
        const path = "/api/2.0/workspace/mkdirs";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as EmptyResponse;
    }

    /**
     * Create a directory.
     *
     * Creates the specified directory (and necessary parent directories if they
     * do not exist). If there is an object (not a directory) at any prefix of
     * the input path, this call returns an error `RESOURCE_ALREADY_EXISTS`.
     *
     * Note that if this operation fails it may have succeeded in creating some
     * of the necessary parent directories.
     */
    @withLogContext(ExposedLoggers.SDK)
    async mkdirs(
        request: workspace.Mkdirs,
        @context context?: Context
    ): Promise<EmptyResponse> {
        return await this._mkdirs(request, context);
    }
}
