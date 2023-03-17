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
     * Get object permissions.
     *
     * Gets the permission of an object. Objects can inherit permissions from
     * their parent objects or root objects.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.Get,
        @context context?: Context
    ): Promise<model.ObjectPermissions> {
        const path = `/api/2.0/permissions/${request.request_object_type}/${request.request_object_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ObjectPermissions;
    }

    /**
     * Get permission levels.
     *
     * Gets the permission levels that a user can have on an object.
     */
    @withLogContext(ExposedLoggers.SDK)
    async getPermissionLevels(
        request: model.GetPermissionLevels,
        @context context?: Context
    ): Promise<model.GetPermissionLevelsResponse> {
        const path = `/api/2.0/permissions/${request.request_object_type}/${request.request_object_id}/permissionLevels`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetPermissionLevelsResponse;
    }

    /**
     * Set permissions.
     *
     * Sets permissions on object. Objects can inherit permissions from their
     * parent objects and root objects.
     */
    @withLogContext(ExposedLoggers.SDK)
    async set(
        request: model.PermissionsRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/permissions/${request.request_object_type}/${request.request_object_id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Update permission.
     *
     * Updates the permissions on an object.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.PermissionsRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/permissions/${request.request_object_type}/${request.request_object_id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
    }
}

export class WorkspaceAssignmentRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("WorkspaceAssignment", method, message);
    }
}
export class WorkspaceAssignmentError extends ApiError {
    constructor(method: string, message?: string) {
        super("WorkspaceAssignment", method, message);
    }
}

/**
 * The Workspace Permission Assignment API allows you to manage workspace
 * permissions for principals in your account.
 */
export class WorkspaceAssignmentService {
    constructor(readonly client: ApiClient) {}
    /**
     * Delete permissions assignment.
     *
     * Deletes the workspace permissions assignment in a given account and
     * workspace for the specified principal.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteWorkspaceAssignmentRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/workspaces/${request.workspace_id}/permissionassignments/principals/${request.principal_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * List workspace permissions.
     *
     * Get an array of workspace permissions for the specified account and
     * workspace.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetWorkspaceAssignmentRequest,
        @context context?: Context
    ): Promise<model.WorkspacePermissions> {
        const path = `/api/2.0/accounts/${this.client.accountId}/workspaces/${request.workspace_id}/permissionassignments/permissions`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.WorkspacePermissions;
    }

    /**
     * Get permission assignments.
     *
     * Get the permission assignments for the specified Databricks Account and
     * Databricks Workspace.
     */
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.ListWorkspaceAssignmentRequest,
        @context context?: Context
    ): Promise<model.PermissionAssignments> {
        const path = `/api/2.0/accounts/${this.client.accountId}/workspaces/${request.workspace_id}/permissionassignments`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.PermissionAssignments;
    }

    /**
     * Create or update permissions assignment.
     *
     * Creates or updates the workspace permissions assignment in a given account
     * and workspace for the specified principal.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.UpdateWorkspaceAssignments,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/accounts/${this.client.accountId}/workspaces/${request.workspace_id}/permissionassignments/principals/${request.principal_id}`;
        return (await this.client.request(
            path,
            "PUT",
            request,
            context
        )) as model.EmptyResponse;
    }
}
