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

export class AccountGroupsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("AccountGroups", method, message);
    }
}
export class AccountGroupsError extends ApiError {
    constructor(method: string, message?: string) {
        super("AccountGroups", method, message);
    }
}

/**
 * Groups simplify identity management, making it easier to assign access to
 * Databricks Account, data, and other securable objects.
 *
 * It is best practice to assign access to workspaces and access-control policies
 * in Unity Catalog to groups, instead of to users individually. All Databricks
 * Account identities can be assigned as members of groups, and members inherit
 * permissions that are assigned to their group.
 */
export class AccountGroupsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.Group,
        @context context?: Context
    ): Promise<model.Group> {
        const path = `/api/2.0/accounts/${this.client.accountId}/scim/v2/Groups`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.Group;
    }

    /**
     * Create a new group.
     *
     * Creates a group in the Databricks Account with a unique name, using the
     * supplied group details.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.Group,
        @context context?: Context
    ): Promise<model.Group> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteGroupRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/scim/v2/Groups/${request.id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a group.
     *
     * Deletes a group from the Databricks Account.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteGroupRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetGroupRequest,
        @context context?: Context
    ): Promise<model.Group> {
        const path = `/api/2.0/accounts/${this.client.accountId}/scim/v2/Groups/${request.id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.Group;
    }

    /**
     * Get group details.
     *
     * Gets the information for a specific group in the Databricks Account.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetGroupRequest,
        @context context?: Context
    ): Promise<model.Group> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: model.ListGroupsRequest,
        @context context?: Context
    ): Promise<model.ListGroupsResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/scim/v2/Groups`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListGroupsResponse;
    }

    /**
     * List group details.
     *
     * Gets all details of the groups associated with the Databricks Account.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.ListGroupsRequest,
        @context context?: Context
    ): Promise<model.ListGroupsResponse> {
        return await this._list(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _patch(
        request: model.PartialUpdate,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/scim/v2/Groups/${request.id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Update group details.
     *
     * Partially updates the details of a group.
     */
    @withLogContext(ExposedLoggers.SDK)
    async patch(
        request: model.PartialUpdate,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._patch(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: model.Group,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/scim/v2/Groups/${request.id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Replace a group.
     *
     * Updates the details of a group by replacing the entire group entity.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.Group,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._update(request, context);
    }
}

export class AccountServicePrincipalsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("AccountServicePrincipals", method, message);
    }
}
export class AccountServicePrincipalsError extends ApiError {
    constructor(method: string, message?: string) {
        super("AccountServicePrincipals", method, message);
    }
}

/**
 * Identities for use with jobs, automated tools, and systems such as scripts,
 * apps, and CI/CD platforms. Databricks recommends creating service principals
 * to run production jobs or modify production data. If all processes that act on
 * production data run with service principals, interactive users do not need any
 * write, delete, or modify privileges in production. This eliminates the risk of
 * a user overwriting production data by accident.
 */
export class AccountServicePrincipalsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.ServicePrincipal,
        @context context?: Context
    ): Promise<model.ServicePrincipal> {
        const path = `/api/2.0/accounts/${this.client.accountId}/scim/v2/ServicePrincipals`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.ServicePrincipal;
    }

    /**
     * Create a service principal.
     *
     * Creates a new service principal in the Databricks Account.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.ServicePrincipal,
        @context context?: Context
    ): Promise<model.ServicePrincipal> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteServicePrincipalRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/scim/v2/ServicePrincipals/${request.id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a service principal.
     *
     * Delete a single service principal in the Databricks Account.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteServicePrincipalRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetServicePrincipalRequest,
        @context context?: Context
    ): Promise<model.ServicePrincipal> {
        const path = `/api/2.0/accounts/${this.client.accountId}/scim/v2/ServicePrincipals/${request.id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ServicePrincipal;
    }

    /**
     * Get service principal details.
     *
     * Gets the details for a single service principal define in the Databricks
     * Account.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetServicePrincipalRequest,
        @context context?: Context
    ): Promise<model.ServicePrincipal> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: model.ListServicePrincipalsRequest,
        @context context?: Context
    ): Promise<model.ListServicePrincipalResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/scim/v2/ServicePrincipals`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListServicePrincipalResponse;
    }

    /**
     * List service principals.
     *
     * Gets the set of service principals associated with a Databricks Account.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.ListServicePrincipalsRequest,
        @context context?: Context
    ): Promise<model.ListServicePrincipalResponse> {
        return await this._list(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _patch(
        request: model.PartialUpdate,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/scim/v2/ServicePrincipals/${request.id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Update service principal details.
     *
     * Partially updates the details of a single service principal in the
     * Databricks Account.
     */
    @withLogContext(ExposedLoggers.SDK)
    async patch(
        request: model.PartialUpdate,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._patch(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: model.ServicePrincipal,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/scim/v2/ServicePrincipals/${request.id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Replace service principal.
     *
     * Updates the details of a single service principal.
     *
     * This action replaces the existing service principal with the same name.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.ServicePrincipal,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._update(request, context);
    }
}

export class AccountUsersRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("AccountUsers", method, message);
    }
}
export class AccountUsersError extends ApiError {
    constructor(method: string, message?: string) {
        super("AccountUsers", method, message);
    }
}

/**
 * User identities recognized by Databricks and represented by email addresses.
 *
 * Databricks recommends using SCIM provisioning to sync users and groups
 * automatically from your identity provider to your Databricks Account. SCIM
 * streamlines onboarding a new employee or team by using your identity provider
 * to create users and groups in Databricks Account and give them the proper
 * level of access. When a user leaves your organization or no longer needs
 * access to Databricks Account, admins can terminate the user in your identity
 * provider and that user’s account will also be removed from Databricks
 * Account. This ensures a consistent offboarding process and prevents
 * unauthorized users from accessing sensitive data.
 */
export class AccountUsersService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.User,
        @context context?: Context
    ): Promise<model.User> {
        const path = `/api/2.0/accounts/${this.client.accountId}/scim/v2/Users`;
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.User;
    }

    /**
     * Create a new user.
     *
     * Creates a new user in the Databricks Account. This new user will also be
     * added to the Databricks account.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.User,
        @context context?: Context
    ): Promise<model.User> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteUserRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/scim/v2/Users/${request.id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a user.
     *
     * Deletes a user. Deleting a user from a Databricks Account also removes
     * objects associated with the user.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteUserRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetUserRequest,
        @context context?: Context
    ): Promise<model.User> {
        const path = `/api/2.0/accounts/${this.client.accountId}/scim/v2/Users/${request.id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.User;
    }

    /**
     * Get user details.
     *
     * Gets information for a specific user in Databricks Account.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetUserRequest,
        @context context?: Context
    ): Promise<model.User> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: model.ListUsersRequest,
        @context context?: Context
    ): Promise<model.ListUsersResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/scim/v2/Users`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListUsersResponse;
    }

    /**
     * List users.
     *
     * Gets details for all the users associated with a Databricks Account.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.ListUsersRequest,
        @context context?: Context
    ): Promise<model.ListUsersResponse> {
        return await this._list(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _patch(
        request: model.PartialUpdate,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/scim/v2/Users/${request.id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Update user details.
     *
     * Partially updates a user resource by applying the supplied operations on
     * specific user attributes.
     */
    @withLogContext(ExposedLoggers.SDK)
    async patch(
        request: model.PartialUpdate,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._patch(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: model.User,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/scim/v2/Users/${request.id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Replace a user.
     *
     * Replaces a user's information with the data supplied in request.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.User,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._update(request, context);
    }
}

export class CurrentUserRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("CurrentUser", method, message);
    }
}
export class CurrentUserError extends ApiError {
    constructor(method: string, message?: string) {
        super("CurrentUser", method, message);
    }
}

/**
 * This API allows retrieving information about currently authenticated user or
 * service principal.
 */
export class CurrentUserService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _me(@context context?: Context): Promise<model.User> {
        const path = "/api/2.0/preview/scim/v2/Me";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.User;
    }

    /**
     * Get current user info.
     *
     * Get details about the current method caller's identity.
     */
    @withLogContext(ExposedLoggers.SDK)
    async me(@context context?: Context): Promise<model.User> {
        return await this._me(context);
    }
}

export class GroupsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Groups", method, message);
    }
}
export class GroupsError extends ApiError {
    constructor(method: string, message?: string) {
        super("Groups", method, message);
    }
}

/**
 * Groups simplify identity management, making it easier to assign access to
 * Databricks Workspace, data, and other securable objects.
 *
 * It is best practice to assign access to workspaces and access-control policies
 * in Unity Catalog to groups, instead of to users individually. All Databricks
 * Workspace identities can be assigned as members of groups, and members inherit
 * permissions that are assigned to their group.
 */
export class GroupsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.Group,
        @context context?: Context
    ): Promise<model.Group> {
        const path = "/api/2.0/preview/scim/v2/Groups";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.Group;
    }

    /**
     * Create a new group.
     *
     * Creates a group in the Databricks Workspace with a unique name, using the
     * supplied group details.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.Group,
        @context context?: Context
    ): Promise<model.Group> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteGroupRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/scim/v2/Groups/${request.id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a group.
     *
     * Deletes a group from the Databricks Workspace.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteGroupRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetGroupRequest,
        @context context?: Context
    ): Promise<model.Group> {
        const path = `/api/2.0/preview/scim/v2/Groups/${request.id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.Group;
    }

    /**
     * Get group details.
     *
     * Gets the information for a specific group in the Databricks Workspace.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetGroupRequest,
        @context context?: Context
    ): Promise<model.Group> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: model.ListGroupsRequest,
        @context context?: Context
    ): Promise<model.ListGroupsResponse> {
        const path = "/api/2.0/preview/scim/v2/Groups";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListGroupsResponse;
    }

    /**
     * List group details.
     *
     * Gets all details of the groups associated with the Databricks Workspace.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.ListGroupsRequest,
        @context context?: Context
    ): Promise<model.ListGroupsResponse> {
        return await this._list(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _patch(
        request: model.PartialUpdate,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/scim/v2/Groups/${request.id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Update group details.
     *
     * Partially updates the details of a group.
     */
    @withLogContext(ExposedLoggers.SDK)
    async patch(
        request: model.PartialUpdate,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._patch(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: model.Group,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/scim/v2/Groups/${request.id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Replace a group.
     *
     * Updates the details of a group by replacing the entire group entity.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.Group,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._update(request, context);
    }
}

export class ServicePrincipalsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("ServicePrincipals", method, message);
    }
}
export class ServicePrincipalsError extends ApiError {
    constructor(method: string, message?: string) {
        super("ServicePrincipals", method, message);
    }
}

/**
 * Identities for use with jobs, automated tools, and systems such as scripts,
 * apps, and CI/CD platforms. Databricks recommends creating service principals
 * to run production jobs or modify production data. If all processes that act on
 * production data run with service principals, interactive users do not need any
 * write, delete, or modify privileges in production. This eliminates the risk of
 * a user overwriting production data by accident.
 */
export class ServicePrincipalsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.ServicePrincipal,
        @context context?: Context
    ): Promise<model.ServicePrincipal> {
        const path = "/api/2.0/preview/scim/v2/ServicePrincipals";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.ServicePrincipal;
    }

    /**
     * Create a service principal.
     *
     * Creates a new service principal in the Databricks Workspace.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.ServicePrincipal,
        @context context?: Context
    ): Promise<model.ServicePrincipal> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteServicePrincipalRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/scim/v2/ServicePrincipals/${request.id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a service principal.
     *
     * Delete a single service principal in the Databricks Workspace.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteServicePrincipalRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetServicePrincipalRequest,
        @context context?: Context
    ): Promise<model.ServicePrincipal> {
        const path = `/api/2.0/preview/scim/v2/ServicePrincipals/${request.id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ServicePrincipal;
    }

    /**
     * Get service principal details.
     *
     * Gets the details for a single service principal define in the Databricks
     * Workspace.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetServicePrincipalRequest,
        @context context?: Context
    ): Promise<model.ServicePrincipal> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: model.ListServicePrincipalsRequest,
        @context context?: Context
    ): Promise<model.ListServicePrincipalResponse> {
        const path = "/api/2.0/preview/scim/v2/ServicePrincipals";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListServicePrincipalResponse;
    }

    /**
     * List service principals.
     *
     * Gets the set of service principals associated with a Databricks Workspace.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.ListServicePrincipalsRequest,
        @context context?: Context
    ): Promise<model.ListServicePrincipalResponse> {
        return await this._list(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _patch(
        request: model.PartialUpdate,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/scim/v2/ServicePrincipals/${request.id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Update service principal details.
     *
     * Partially updates the details of a single service principal in the
     * Databricks Workspace.
     */
    @withLogContext(ExposedLoggers.SDK)
    async patch(
        request: model.PartialUpdate,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._patch(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: model.ServicePrincipal,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/scim/v2/ServicePrincipals/${request.id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Replace service principal.
     *
     * Updates the details of a single service principal.
     *
     * This action replaces the existing service principal with the same name.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.ServicePrincipal,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._update(request, context);
    }
}

export class UsersRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Users", method, message);
    }
}
export class UsersError extends ApiError {
    constructor(method: string, message?: string) {
        super("Users", method, message);
    }
}

/**
 * User identities recognized by Databricks and represented by email addresses.
 *
 * Databricks recommends using SCIM provisioning to sync users and groups
 * automatically from your identity provider to your Databricks Workspace. SCIM
 * streamlines onboarding a new employee or team by using your identity provider
 * to create users and groups in Databricks Workspace and give them the proper
 * level of access. When a user leaves your organization or no longer needs
 * access to Databricks Workspace, admins can terminate the user in your identity
 * provider and that user’s account will also be removed from Databricks
 * Workspace. This ensures a consistent offboarding process and prevents
 * unauthorized users from accessing sensitive data.
 */
export class UsersService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.User,
        @context context?: Context
    ): Promise<model.User> {
        const path = "/api/2.0/preview/scim/v2/Users";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.User;
    }

    /**
     * Create a new user.
     *
     * Creates a new user in the Databricks Workspace. This new user will also be
     * added to the Databricks account.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.User,
        @context context?: Context
    ): Promise<model.User> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteUserRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/scim/v2/Users/${request.id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a user.
     *
     * Deletes a user. Deleting a user from a Databricks Workspace also removes
     * objects associated with the user.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteUserRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetUserRequest,
        @context context?: Context
    ): Promise<model.User> {
        const path = `/api/2.0/preview/scim/v2/Users/${request.id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.User;
    }

    /**
     * Get user details.
     *
     * Gets information for a specific user in Databricks Workspace.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetUserRequest,
        @context context?: Context
    ): Promise<model.User> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: model.ListUsersRequest,
        @context context?: Context
    ): Promise<model.ListUsersResponse> {
        const path = "/api/2.0/preview/scim/v2/Users";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListUsersResponse;
    }

    /**
     * List users.
     *
     * Gets details for all the users associated with a Databricks Workspace.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.ListUsersRequest,
        @context context?: Context
    ): Promise<model.ListUsersResponse> {
        return await this._list(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _patch(
        request: model.PartialUpdate,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/scim/v2/Users/${request.id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Update user details.
     *
     * Partially updates a user resource by applying the supplied operations on
     * specific user attributes.
     */
    @withLogContext(ExposedLoggers.SDK)
    async patch(
        request: model.PartialUpdate,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._patch(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: model.User,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/preview/scim/v2/Users/${request.id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Replace a user.
     *
     * Replaces a user's information with the data supplied in request.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.User,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._update(request, context);
    }
}
