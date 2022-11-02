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

*/
export class CurrentUserService {
    constructor(readonly client: ApiClient) {}
    /**
     * Fetch details about caller identity
     *
     * Get details about caller identity
     */
    @withLogContext(ExposedLoggers.SDK)
    async me(@context context?: Context): Promise<model.User> {
        const path = "/api/2.0/preview/scim/v2/Me";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.User;
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

*/
export class GroupsService {
    constructor(readonly client: ApiClient) {}
    /**
     * Delete a group in <Workspace>
     *
     * Remove a group in the <Workspace>.
     */
    @withLogContext(ExposedLoggers.SDK)
    async deleteGroup(
        request: model.DeleteGroupRequest,
        @context context?: Context
    ): Promise<model.DeleteGroupResponse> {
        const path = `/api/2.0/preview/scim/v2/Groups/${request.id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.DeleteGroupResponse;
    }

    /**
     * Fetch details of a group in <Workspace>
     *
     * Fetch information of one group in the <Workspace>
     */
    @withLogContext(ExposedLoggers.SDK)
    async fetchGroup(
        request: model.FetchGroupRequest,
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
     * Fetch details of multiple groups in <Workspace>
     *
     * Get all details of the groups associated with the <Workspace>.
     */
    @withLogContext(ExposedLoggers.SDK)
    async listGroups(
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
     * Create a new group in <Workspace>
     *
     * Create one group in the <Workspace> with a unique name
     */
    @withLogContext(ExposedLoggers.SDK)
    async newGroup(
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
     * Update details of a group
     *
     * Partially update details of a group
     */
    @withLogContext(ExposedLoggers.SDK)
    async patchGroup(
        request: model.PartialUpdate,
        @context context?: Context
    ): Promise<model.PatchGroupResponse> {
        const path = `/api/2.0/preview/scim/v2/Groups/${request.id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.PatchGroupResponse;
    }

    /**
     * Update details of a group
     *
     * Update details of a group by replacing the entire entity
     */
    @withLogContext(ExposedLoggers.SDK)
    async replaceGroup(
        request: model.Group,
        @context context?: Context
    ): Promise<model.ReplaceGroupResponse> {
        const path = `/api/2.0/preview/scim/v2/Groups/${request.id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.ReplaceGroupResponse;
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

*/
export class ServicePrincipalsService {
    constructor(readonly client: ApiClient) {}
    /**
     * Delete a service principal in <Workspace>
     *
     * Delete one service principal
     */
    @withLogContext(ExposedLoggers.SDK)
    async deleteServicePrincipal(
        request: model.DeleteServicePrincipalRequest,
        @context context?: Context
    ): Promise<model.DeleteServicePrincipalResponse> {
        const path = `/api/2.0/preview/scim/v2/ServicePrincipals/${request.id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.DeleteServicePrincipalResponse;
    }

    /**
     * Fetch details of a service principal in <Workspace>
     *
     * Fetch information of one service principal
     */
    @withLogContext(ExposedLoggers.SDK)
    async fetchServicePrincipal(
        request: model.FetchServicePrincipalRequest,
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
     * Fetch details of multiple service principals in <Workspace>
     *
     * Get multiple service principals associated with a <Workspace>.
     */
    @withLogContext(ExposedLoggers.SDK)
    async listServicePrincipals(
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
     * Create a new service principal in <Workspace>
     *
     * Create one service principal in the <Workspace>.
     */
    @withLogContext(ExposedLoggers.SDK)
    async newServicePrincipal(
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
     * Update details of a service principal in <Workspace>
     *
     * Partially update details of one service principal.
     */
    @withLogContext(ExposedLoggers.SDK)
    async patchServicePrincipal(
        request: model.PartialUpdate,
        @context context?: Context
    ): Promise<model.PatchServicePrincipalResponse> {
        const path = `/api/2.0/preview/scim/v2/ServicePrincipals/${request.id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.PatchServicePrincipalResponse;
    }

    /**
     * Replace service principal in <Workspace>
     *
     * Update details of one service principal.
     */
    @withLogContext(ExposedLoggers.SDK)
    async replaceServicePrincipal(
        request: model.ServicePrincipal,
        @context context?: Context
    ): Promise<model.ReplaceServicePrincipalResponse> {
        const path = `/api/2.0/preview/scim/v2/ServicePrincipals/${request.id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.ReplaceServicePrincipalResponse;
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

*/
export class UsersService {
    constructor(readonly client: ApiClient) {}
    /**
     * Delete a user in <Workspace>
     *
     * Delete one user. Deleting a user from a workspace also removes objects
     * associated with the user.
     */
    @withLogContext(ExposedLoggers.SDK)
    async deleteUser(
        request: model.DeleteUserRequest,
        @context context?: Context
    ): Promise<model.DeleteUserResponse> {
        const path = `/api/2.0/preview/scim/v2/Users/${request.id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.DeleteUserResponse;
    }

    /**
     * Get details of a user in <Workspace>
     *
     * Fetch information of one user in <Workspace>
     */
    @withLogContext(ExposedLoggers.SDK)
    async fetchUser(
        request: model.FetchUserRequest,
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
     * Fetch details of multiple users in <Workspace>
     *
     * Get all the users associated with a <Workspace>.
     */
    @withLogContext(ExposedLoggers.SDK)
    async listUsers(
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
     * Create a new user in <Workspace>
     *
     * Create a user in the <Workspace> who will automatically added to the
     * account.
     */
    @withLogContext(ExposedLoggers.SDK)
    async newUser(
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
     * Update details of a user in <Workspace>
     *
     * Partially update a user resource with operations on specific attributes
     */
    @withLogContext(ExposedLoggers.SDK)
    async patchUser(
        request: model.PartialUpdate,
        @context context?: Context
    ): Promise<model.PatchUserResponse> {
        const path = `/api/2.0/preview/scim/v2/Users/${request.id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.PatchUserResponse;
    }

    /**
     * Update details of a user in <Workspace>
     *
     * Replaces user with the data supplied in request
     */
    @withLogContext(ExposedLoggers.SDK)
    async replaceUser(
        request: model.User,
        @context context?: Context
    ): Promise<model.ReplaceUserResponse> {
        const path = `/api/2.0/preview/scim/v2/Users/${request.id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.ReplaceUserResponse;
    }
}
