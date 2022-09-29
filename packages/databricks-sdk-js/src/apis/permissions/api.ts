/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

import {ApiClient} from "../../api-client";
import * as model from "./model";
import Time from "../../retries/Time";
import retry from "../../retries/retries";
import {CancellationToken} from "../../types";
import {ApiError, ApiRetriableError} from "../apiError";

export class PermissionsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Permissions", method, message);
    }
}
export class PermissionsError extends ApiError {
    constructor(method: string, message?: string) {
        super("Permissions", method, message);
    }
}

/**
 * Permissions API are used to create read, write, edit, update and manage access
 * for various users on different objects and endpoints.
 */
export class PermissionsService {
    constructor(readonly client: ApiClient) {}
    /**
     * Get object permissions
     *
     * Get the permission of an object. Objects can inherit permissions from
     * their parent objects or root objects.
     */
    async getObjectPermissions(
        request: model.GetObjectPermissionsRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.ObjectPermissions> {
        const path = `/api/2.0/permissions/${request.object_type}/${request.object_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            cancellationToken
        )) as model.ObjectPermissions;
    }

    /**
     * Get permission levels
     *
     * Get permission levels that a user can have.
     */
    async getPermissionLevels(
        request: model.GetPermissionLevelsRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.GetPermissionLevelsResponse> {
        const path = `/api/2.0/permissions/${request.request_object_type}/${request.request_object_id}/permissionLevels`;
        return (await this.client.request(
            path,
            "GET",
            request,
            cancellationToken
        )) as model.GetPermissionLevelsResponse;
    }

    /**
     * Set permissions
     *
     * Set permissions on object. Objects can inherit permissiond from their
     * parent objects and root objects.
     */
    async setObjectPermissions(
        request: model.SetObjectPermissions,
        cancellationToken?: CancellationToken
    ): Promise<model.SetObjectPermissionsResponse> {
        const path = `/api/2.0/permissions/${request.object_type}/${request.object_id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            cancellationToken
        )) as model.SetObjectPermissionsResponse;
    }

    /**
     * Update permission
     *
     * Update permission on objects
     */
    async updateObjectPermissions(
        request: model.UpdateObjectPermissions,
        cancellationToken?: CancellationToken
    ): Promise<model.UpdateObjectPermissionsResponse> {
        const path = `/api/2.0/permissions/${request.object_type}/${request.object_id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            cancellationToken
        )) as model.UpdateObjectPermissionsResponse;
    }
}
