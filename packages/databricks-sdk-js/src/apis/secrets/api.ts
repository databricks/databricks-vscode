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
    /**
     * Create a new secret scope.
     *
     * The scope name must consist of alphanumeric characters, dashes,
     * underscores, and periods, and may not exceed 128 characters. The maximum
     * number of scopes in a workspace is 100.
     */
    @withLogContext(ExposedLoggers.SDK)
    async createScope(
        request: model.CreateScope,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/secrets/scopes/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.EmptyResponse;
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
        request: model.DeleteAcl,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/secrets/acls/delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.EmptyResponse;
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
        request: model.DeleteScope,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/secrets/scopes/delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.EmptyResponse;
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
        request: model.DeleteSecret,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/secrets/delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.EmptyResponse;
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
        request: model.GetAcl,
        @context context?: Context
    ): Promise<model.AclItem> {
        const path = "/api/2.0/secrets/acls/get";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as unknown as model.AclItem;
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
    async listAcls(
        request: model.ListAcls,
        @context context?: Context
    ): Promise<model.ListAclsResponse> {
        const path = "/api/2.0/secrets/acls/list";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as unknown as model.ListAclsResponse;
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
    async listScopes(
        @context context?: Context
    ): Promise<model.ListScopesResponse> {
        const path = "/api/2.0/secrets/scopes/list";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as unknown as model.ListScopesResponse;
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
    async listSecrets(
        request: model.ListSecrets,
        @context context?: Context
    ): Promise<model.ListSecretsResponse> {
        const path = "/api/2.0/secrets/list";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as unknown as model.ListSecretsResponse;
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
     * Note that in general, secret values can only be read from within a
     * command\non a cluster (for example, through a notebook). There is no API
     * to read the actual secret value material outside of a cluster. However,
     * the user's permission will be applied based on who is executing the
     * command, and they must have at least READ permission.
     *
     * Users must have the `MANAGE` permission to invoke this API.
     *
     * The principal is a user or group name corresponding to an existing
     * Databricks principal to be granted or revoked access.
     *
     * Throws `RESOURCE_DOES_NOT_EXIST` if no such secret scope exists. Throws
     * `RESOURCE_ALREADY_EXISTS` if a permission for the principal already
     * exists. Throws `INVALID_PARAMETER_VALUE` if the permission is invalid.
     * Throws `PERMISSION_DENIED` if the user does not have permission to make
     * this API call.
     */
    @withLogContext(ExposedLoggers.SDK)
    async putAcl(
        request: model.PutAcl,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/secrets/acls/put";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.EmptyResponse;
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
        request: model.PutSecret,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/secrets/put";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as unknown as model.EmptyResponse;
    }
}
