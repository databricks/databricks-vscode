/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
export interface AccessControlRequest {
    /**
     * name of the group
     */
    group_name?: string;
    /**
     * Permission level
     */
    permission_level?: PermissionLevel;
    /**
     * name of the service principal
     */
    service_principal_name?: string;
    /**
     * name of the user
     */
    user_name?: string;
}

export interface AccessControlResponse {
    /**
     * All permissions.
     */
    all_permissions?: Array<Permission>;
    /**
     * name of the group
     */
    group_name?: string;
    /**
     * name of the service principal
     */
    service_principal_name?: string;
    /**
     * name of the user
     */
    user_name?: string;
}

/**
 * Delete permissions assignment
 */
export interface DeleteWorkspaceAssignmentRequest {
    /**
     * The ID of the user, service principal, or group.
     */
    principal_id: number;
    /**
     * The workspace ID.
     */
    workspace_id: number;
}

/**
 * Get object permissions
 */
export interface Get {
    request_object_id: string;
    /**
     * <needs content>
     */
    request_object_type: string;
}

/**
 * Get permission levels
 */
export interface GetPermissionLevels {
    /**
     * <needs content>
     */
    request_object_id: string;
    /**
     * <needs content>
     */
    request_object_type: string;
}

export interface GetPermissionLevelsResponse {
    /**
     * Specific permission levels
     */
    permission_levels?: Array<PermissionsDescription>;
}

/**
 * List workspace permissions
 */
export interface GetWorkspaceAssignmentRequest {
    /**
     * The workspace ID.
     */
    workspace_id: number;
}

/**
 * Get permission assignments
 */
export interface ListWorkspaceAssignmentRequest {
    /**
     * The workspace ID for the account.
     */
    workspace_id: number;
}

export interface ObjectPermissions {
    access_control_list?: Array<AccessControlResponse>;
    object_id?: string;
    object_type?: string;
}

export interface Permission {
    inherited?: boolean;
    inherited_from_object?: Array<string>;
    /**
     * Permission level
     */
    permission_level?: PermissionLevel;
}

export interface PermissionAssignment {
    /**
     * Error response associated with a workspace permission assignment, if any.
     */
    error?: string;
    /**
     * The permissions level of the principal.
     */
    permissions?: Array<WorkspacePermission>;
    /**
     * Information about the principal assigned to the workspace.
     */
    principal?: PrincipalOutput;
}

export interface PermissionAssignments {
    /**
     * Array of permissions assignments defined for a workspace.
     */
    permission_assignments?: Array<PermissionAssignment>;
}

/**
 * Permission level
 */
export type PermissionLevel =
    | "CAN_ATTACH_TO"
    | "CAN_BIND"
    | "CAN_EDIT"
    | "CAN_EDIT_METADATA"
    | "CAN_MANAGE"
    | "CAN_MANAGE_PRODUCTION_VERSIONS"
    | "CAN_MANAGE_RUN"
    | "CAN_MANAGE_STAGING_VERSIONS"
    | "CAN_READ"
    | "CAN_RESTART"
    | "CAN_RUN"
    | "CAN_USE"
    | "CAN_VIEW"
    | "CAN_VIEW_METADATA"
    | "IS_OWNER";

export interface PermissionOutput {
    /**
     * The results of a permissions query.
     */
    description?: string;
    permission_level?: WorkspacePermission;
}

export interface PermissionsDescription {
    description?: string;
    /**
     * Permission level
     */
    permission_level?: PermissionLevel;
}

export interface PermissionsRequest {
    access_control_list?: Array<AccessControlRequest>;
    request_object_id: string;
    /**
     * <needs content>
     */
    request_object_type: string;
}

export interface PrincipalOutput {
    /**
     * The display name of the principal.
     */
    display_name?: string;
    /**
     * The group name of the groupl. Present only if the principal is a group.
     */
    group_name?: string;
    /**
     * The unique, opaque id of the principal.
     */
    principal_id?: number;
    /**
     * The name of the service principal. Present only if the principal is a
     * service principal.
     */
    service_principal_name?: string;
    /**
     * The username of the user. Present only if the principal is a user.
     */
    user_name?: string;
}

export interface UpdateWorkspaceAssignments {
    /**
     * Array of permissions assignments to update on the workspace.
     */
    permissions: Array<WorkspacePermission>;
    /**
     * The ID of the user, service principal, or group.
     */
    principal_id: number;
    /**
     * The workspace ID.
     */
    workspace_id: number;
}

export type WorkspacePermission = "ADMIN" | "UNKNOWN" | "USER";

export interface WorkspacePermissions {
    /**
     * Array of permissions defined for a workspace.
     */
    permissions?: Array<PermissionOutput>;
}

export interface EmptyResponse {}
