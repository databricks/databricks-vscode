/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

import {ApiClient} from "../../api-client";
import * as model from "./model";
import Time from "../../retries/Time";
import retry from "../../retries/retries";
import {CancellationToken} from "../../types";
import {ApiError, ApiRetriableError} from "../apiError";

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
    async me(cancellationToken?: CancellationToken): Promise<model.User> {
        const path = "/api/2.0/preview/scim/v2/Me";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            cancellationToken
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
    async deleteGroup(
        request: model.DeleteGroupRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.DeleteGroupResponse> {
        const path = `/api/2.0/preview/scim/v2/Groups/${request.id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            cancellationToken
        )) as model.DeleteGroupResponse;
    }

    /**
     * Fetch details of a group in <Workspace>
     *
     * Fetch information of one group in the <Workspace>
     */
    async fetchGroup(
        request: model.FetchGroupRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.Group> {
        const path = `/api/2.0/preview/scim/v2/Groups/${request.id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            cancellationToken
        )) as model.Group;
    }

    /**
     * Fetch details of multiple groups in <Workspace>
     *
     * Get all details of the groups associated with the <Workspace>.
     */
    async listGroups(
        request: model.ListGroupsRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.ListGroupsResponse> {
        const path = "/api/2.0/preview/scim/v2/Groups";
        return (await this.client.request(
            path,
            "GET",
            request,
            cancellationToken
        )) as model.ListGroupsResponse;
    }

    /**
     * Create a new group in <Workspace>
     *
     * Create one group in the <Workspace> with a unique name
     */
    async newGroup(
        request: model.Group,
        cancellationToken?: CancellationToken
    ): Promise<model.Group> {
        const path = "/api/2.0/preview/scim/v2/Groups";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.Group;
    }

    /**
     * Update details of a group
     *
     * Partially update details of a group
     */
    async patchGroup(
        request: model.PartialUpdate,
        cancellationToken?: CancellationToken
    ): Promise<model.PatchGroupResponse> {
        const path = `/api/2.0/preview/scim/v2/Groups/${request.id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            cancellationToken
        )) as model.PatchGroupResponse;
    }

    /**
     * Update details of a group
     *
     * Update details of a group by replacing the entire entity
     */
    async replaceGroup(
        request: model.Group,
        cancellationToken?: CancellationToken
    ): Promise<model.ReplaceGroupResponse> {
        const path = `/api/2.0/preview/scim/v2/Groups/${request.id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            cancellationToken
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
    async deleteServicePrincipal(
        request: model.DeleteServicePrincipalRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.DeleteServicePrincipalResponse> {
        const path = `/api/2.0/preview/scim/v2/ServicePrincipals/${request.id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            cancellationToken
        )) as model.DeleteServicePrincipalResponse;
    }

    /**
     * Fetch details of a service principal in <Workspace>
     *
     * Fetch information of one service principal
     */
    async fetchServicePrincipal(
        request: model.FetchServicePrincipalRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.ServicePrincipal> {
        const path = `/api/2.0/preview/scim/v2/ServicePrincipals/${request.id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            cancellationToken
        )) as model.ServicePrincipal;
    }

    /**
     * Fetch details of multiple service principals in <Workspace>
     *
     * Get multiple service principals associated with a <Workspace>.
     */
    async listServicePrincipals(
        request: model.ListServicePrincipalsRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.ListServicePrincipalResponse> {
        const path = "/api/2.0/preview/scim/v2/ServicePrincipals";
        return (await this.client.request(
            path,
            "GET",
            request,
            cancellationToken
        )) as model.ListServicePrincipalResponse;
    }

    /**
     * Create a new service principal in <Workspace>
     *
     * Create one service principal in the <Workspace>.
     */
    async newServicePrincipal(
        request: model.ServicePrincipal,
        cancellationToken?: CancellationToken
    ): Promise<model.ServicePrincipal> {
        const path = "/api/2.0/preview/scim/v2/ServicePrincipals";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.ServicePrincipal;
    }

    /**
     * Update details of a service principal in <Workspace>
     *
     * Partially update details of one service principal.
     */
    async patchServicePrincipal(
        request: model.PartialUpdate,
        cancellationToken?: CancellationToken
    ): Promise<model.PatchServicePrincipalResponse> {
        const path = `/api/2.0/preview/scim/v2/ServicePrincipals/${request.id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            cancellationToken
        )) as model.PatchServicePrincipalResponse;
    }

    /**
     * Replace service principal in <Workspace>
     *
     * Update details of one service principal.
     */
    async replaceServicePrincipal(
        request: model.ServicePrincipal,
        cancellationToken?: CancellationToken
    ): Promise<model.ReplaceServicePrincipalResponse> {
        const path = `/api/2.0/preview/scim/v2/ServicePrincipals/${request.id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            cancellationToken
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
    async deleteUser(
        request: model.DeleteUserRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.DeleteUserResponse> {
        const path = `/api/2.0/preview/scim/v2/Users/${request.id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            cancellationToken
        )) as model.DeleteUserResponse;
    }

    /**
     * Get details of a user in <Workspace>
     *
     * Fetch information of one user in <Workspace>
     */
    async fetchUser(
        request: model.FetchUserRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.User> {
        const path = `/api/2.0/preview/scim/v2/Users/${request.id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            cancellationToken
        )) as model.User;
    }

    /**
     * Fetch details of multiple users in <Workspace>
     *
     * Get all the users associated with a <Workspace>.
     */
    async listUsers(
        request: model.ListUsersRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.ListUsersResponse> {
        const path = "/api/2.0/preview/scim/v2/Users";
        return (await this.client.request(
            path,
            "GET",
            request,
            cancellationToken
        )) as model.ListUsersResponse;
    }

    /**
     * Create a new user in <Workspace>
     *
     * Create a user in the <Workspace> who will automatically added to the
     * account.
     */
    async newUser(
        request: model.User,
        cancellationToken?: CancellationToken
    ): Promise<model.User> {
        const path = "/api/2.0/preview/scim/v2/Users";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.User;
    }

    /**
     * Update details of a user in <Workspace>
     *
     * Partially update a user resource with operations on specific attributes
     */
    async patchUser(
        request: model.PartialUpdate,
        cancellationToken?: CancellationToken
    ): Promise<model.PatchUserResponse> {
        const path = `/api/2.0/preview/scim/v2/Users/${request.id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            cancellationToken
        )) as model.PatchUserResponse;
    }

    /**
     * Update details of a user in <Workspace>
     *
     * Replaces user with the data supplied in request
     */
    async replaceUser(
        request: model.User,
        cancellationToken?: CancellationToken
    ): Promise<model.ReplaceUserResponse> {
        const path = `/api/2.0/preview/scim/v2/Users/${request.id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            cancellationToken
        )) as model.ReplaceUserResponse;
    }
}
