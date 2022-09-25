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
    permission_level?: AccessControlRequestPermissionLevel;
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
 * Permission level
 */
export type AccessControlRequestPermissionLevel =
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

export interface GetPermissionLevelsResponse {
    /**
     * Specific permission levels
     */
    permission_levels?: Array<PermissionsDescription>;
}

export interface ObjectPermissions {
    access_control_list?: Array<AccessControlResponse>;
    object_id?: string;
    object_type?: string;
}

export interface Permission {
    inherited?: boolean;
    inherited_from_object?: Array<string>;
    permission_level?: PermissionPermissionLevel;
}

export type PermissionPermissionLevel =
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

export interface PermissionsDescription {
    description?: string;
    permission_level?: PermissionsDescriptionPermissionLevel;
}

export type PermissionsDescriptionPermissionLevel =
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

export interface SetObjectPermissions {
    access_control_list?: Array<AccessControlRequest>;
    object_id?: string;
    object_type?: string;
}

export interface UpdateObjectPermissions {
    access_control_list?: Array<AccessControlRequest>;
    object_id?: string;
    object_type?: string;
}

export interface GetObjectPermissionsRequest {
    object_id: string;
    /**
     * <needs content>
     */
    object_type: string;
}

export interface GetPermissionLevelsRequest {
    /**
     * <needs content>
     */
    request_object_id: string;
    /**
     * <needs content>
     */
    request_object_type: string;
}

export interface SetObjectPermissionsResponse {}
export interface UpdateObjectPermissionsResponse {}
