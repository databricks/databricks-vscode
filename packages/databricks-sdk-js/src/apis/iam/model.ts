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

export interface ComplexValue {
    display?: string;
    primary?: boolean;
    $ref?: string;
    type?: string;
    value?: string;
}

/**
 * Delete a group
 */
export interface DeleteAccountGroupRequest {
    /**
     * Unique ID for a group in the Databricks account.
     */
    id: string;
}

/**
 * Delete a service principal
 */
export interface DeleteAccountServicePrincipalRequest {
    /**
     * Unique ID for a service principal in the Databricks account.
     */
    id: string;
}

/**
 * Delete a user
 */
export interface DeleteAccountUserRequest {
    /**
     * Unique ID for a user in the Databricks account.
     */
    id: string;
}

/**
 * Delete a group
 */
export interface DeleteGroupRequest {
    /**
     * Unique ID for a group in the Databricks workspace.
     */
    id: string;
}

/**
 * Delete a service principal
 */
export interface DeleteServicePrincipalRequest {
    /**
     * Unique ID for a service principal in the Databricks workspace.
     */
    id: string;
}

/**
 * Delete a user
 */
export interface DeleteUserRequest {
    /**
     * Unique ID for a user in the Databricks workspace.
     */
    id: string;
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
 * Get group details
 */
export interface GetAccountGroupRequest {
    /**
     * Unique ID for a group in the Databricks account.
     */
    id: string;
}

/**
 * Get service principal details
 */
export interface GetAccountServicePrincipalRequest {
    /**
     * Unique ID for a service principal in the Databricks account.
     */
    id: string;
}

/**
 * Get user details
 */
export interface GetAccountUserRequest {
    /**
     * Unique ID for a user in the Databricks account.
     */
    id: string;
}

/**
 * Get assignable roles for a resource
 */
export interface GetAssignableRolesForResourceRequest {
    /**
     * The resource name for which assignable roles will be listed.
     */
    resource: string;
}

export interface GetAssignableRolesForResourceResponse {
    roles?: Array<string>;
}

/**
 * Get group details
 */
export interface GetGroupRequest {
    /**
     * Unique ID for a group in the Databricks workspace.
     */
    id: string;
}

/**
 * Get permission levels
 */
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

export interface GetPermissionLevelsResponse {
    /**
     * Specific permission levels
     */
    permission_levels?: Array<PermissionsDescription>;
}

/**
 * Get object permissions
 */
export interface GetPermissionRequest {
    request_object_id: string;
    /**
     * <needs content>
     */
    request_object_type: string;
}

/**
 * Get a rule set
 */
export interface GetRuleSetRequest {
    /**
     * Etag used for versioning. The response is at least as fresh as the eTag
     * provided. Etag is used for optimistic concurrency control as a way to help
     * prevent simultaneous updates of a rule set from overwriting each other. It
     * is strongly suggested that systems make use of the etag in the read ->
     * modify -> write pattern to perform rule set updates in order to avoid race
     * conditions that is get an etag from a GET rule set request, and pass it
     * with the PUT update request to identify the rule set version you are
     * updating.
     */
    etag: string;
    /**
     * The ruleset name associated with the request.
     */
    name: string;
}

/**
 * Get service principal details
 */
export interface GetServicePrincipalRequest {
    /**
     * Unique ID for a service principal in the Databricks workspace.
     */
    id: string;
}

/**
 * Get user details
 */
export interface GetUserRequest {
    /**
     * Unique ID for a user in the Databricks workspace.
     */
    id: string;
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

export interface GrantRule {
    /**
     * Principals this grant rule applies to.
     */
    principals?: Array<string>;
    /**
     * Role that is assigned to the list of principals.
     */
    role: string;
}

export interface Group {
    /**
     * String that represents a human-readable group name
     */
    displayName?: string;
    entitlements?: Array<ComplexValue>;
    externalId?: string;
    groups?: Array<ComplexValue>;
    /**
     * Databricks group ID
     */
    id?: string;
    members?: Array<ComplexValue>;
    roles?: Array<ComplexValue>;
}

/**
 * List group details
 */
export interface ListAccountGroupsRequest {
    /**
     * Comma-separated list of attributes to return in response.
     */
    attributes?: string;
    /**
     * Desired number of results per page. Default is 10000.
     */
    count?: number;
    /**
     * Comma-separated list of attributes to exclude in response.
     */
    excludedAttributes?: string;
    /**
     * Query by which the results have to be filtered. Supported operators are
     * equals(`eq`), contains(`co`), starts with(`sw`) and not equals(`ne`).
     * Additionally, simple expressions can be formed using logical operators -
     * `and` and `or`. The [SCIM RFC] has more details but we currently only
     * support simple expressions.
     *
     * [SCIM RFC]: https://tools.ietf.org/html/rfc7644#section-3.4.2.2
     */
    filter?: string;
    /**
     * Attribute to sort the results.
     */
    sortBy?: string;
    /**
     * The order to sort the results.
     */
    sortOrder?: ListSortOrder;
    /**
     * Specifies the index of the first result. First item is number 1.
     */
    startIndex?: number;
}

/**
 * List service principals
 */
export interface ListAccountServicePrincipalsRequest {
    /**
     * Comma-separated list of attributes to return in response.
     */
    attributes?: string;
    /**
     * Desired number of results per page. Default is 10000.
     */
    count?: number;
    /**
     * Comma-separated list of attributes to exclude in response.
     */
    excludedAttributes?: string;
    /**
     * Query by which the results have to be filtered. Supported operators are
     * equals(`eq`), contains(`co`), starts with(`sw`) and not equals(`ne`).
     * Additionally, simple expressions can be formed using logical operators -
     * `and` and `or`. The [SCIM RFC] has more details but we currently only
     * support simple expressions.
     *
     * [SCIM RFC]: https://tools.ietf.org/html/rfc7644#section-3.4.2.2
     */
    filter?: string;
    /**
     * Attribute to sort the results.
     */
    sortBy?: string;
    /**
     * The order to sort the results.
     */
    sortOrder?: ListSortOrder;
    /**
     * Specifies the index of the first result. First item is number 1.
     */
    startIndex?: number;
}

/**
 * List users
 */
export interface ListAccountUsersRequest {
    /**
     * Comma-separated list of attributes to return in response.
     */
    attributes?: string;
    /**
     * Desired number of results per page. Default is 10000.
     */
    count?: number;
    /**
     * Comma-separated list of attributes to exclude in response.
     */
    excludedAttributes?: string;
    /**
     * Query by which the results have to be filtered. Supported operators are
     * equals(`eq`), contains(`co`), starts with(`sw`) and not equals(`ne`).
     * Additionally, simple expressions can be formed using logical operators -
     * `and` and `or`. The [SCIM RFC] has more details but we currently only
     * support simple expressions.
     *
     * [SCIM RFC]: https://tools.ietf.org/html/rfc7644#section-3.4.2.2
     */
    filter?: string;
    /**
     * Attribute to sort the results. Multi-part paths are supported. For
     * example, `userName`, `name.givenName`, and `emails`.
     */
    sortBy?: string;
    /**
     * The order to sort the results.
     */
    sortOrder?: ListSortOrder;
    /**
     * Specifies the index of the first result. First item is number 1.
     */
    startIndex?: number;
}

/**
 * List group details
 */
export interface ListGroupsRequest {
    /**
     * Comma-separated list of attributes to return in response.
     */
    attributes?: string;
    /**
     * Desired number of results per page.
     */
    count?: number;
    /**
     * Comma-separated list of attributes to exclude in response.
     */
    excludedAttributes?: string;
    /**
     * Query by which the results have to be filtered. Supported operators are
     * equals(`eq`), contains(`co`), starts with(`sw`) and not equals(`ne`).
     * Additionally, simple expressions can be formed using logical operators -
     * `and` and `or`. The [SCIM RFC] has more details but we currently only
     * support simple expressions.
     *
     * [SCIM RFC]: https://tools.ietf.org/html/rfc7644#section-3.4.2.2
     */
    filter?: string;
    /**
     * Attribute to sort the results.
     */
    sortBy?: string;
    /**
     * The order to sort the results.
     */
    sortOrder?: ListSortOrder;
    /**
     * Specifies the index of the first result. First item is number 1.
     */
    startIndex?: number;
}

export interface ListGroupsResponse {
    /**
     * Total results returned in the response.
     */
    itemsPerPage?: number;
    /**
     * User objects returned in the response.
     */
    Resources?: Array<Group>;
    /**
     * Starting index of all the results that matched the request filters. First
     * item is number 1.
     */
    startIndex?: number;
    /**
     * Total results that match the request filters.
     */
    totalResults?: number;
}

export interface ListServicePrincipalResponse {
    /**
     * Total results returned in the response.
     */
    itemsPerPage?: number;
    /**
     * User objects returned in the response.
     */
    Resources?: Array<ServicePrincipal>;
    /**
     * Starting index of all the results that matched the request filters. First
     * item is number 1.
     */
    startIndex?: number;
    /**
     * Total results that match the request filters.
     */
    totalResults?: number;
}

/**
 * List service principals
 */
export interface ListServicePrincipalsRequest {
    /**
     * Comma-separated list of attributes to return in response.
     */
    attributes?: string;
    /**
     * Desired number of results per page.
     */
    count?: number;
    /**
     * Comma-separated list of attributes to exclude in response.
     */
    excludedAttributes?: string;
    /**
     * Query by which the results have to be filtered. Supported operators are
     * equals(`eq`), contains(`co`), starts with(`sw`) and not equals(`ne`).
     * Additionally, simple expressions can be formed using logical operators -
     * `and` and `or`. The [SCIM RFC] has more details but we currently only
     * support simple expressions.
     *
     * [SCIM RFC]: https://tools.ietf.org/html/rfc7644#section-3.4.2.2
     */
    filter?: string;
    /**
     * Attribute to sort the results.
     */
    sortBy?: string;
    /**
     * The order to sort the results.
     */
    sortOrder?: ListSortOrder;
    /**
     * Specifies the index of the first result. First item is number 1.
     */
    startIndex?: number;
}

export type ListSortOrder = "ascending" | "descending";

/**
 * List users
 */
export interface ListUsersRequest {
    /**
     * Comma-separated list of attributes to return in response.
     */
    attributes?: string;
    /**
     * Desired number of results per page.
     */
    count?: number;
    /**
     * Comma-separated list of attributes to exclude in response.
     */
    excludedAttributes?: string;
    /**
     * Query by which the results have to be filtered. Supported operators are
     * equals(`eq`), contains(`co`), starts with(`sw`) and not equals(`ne`).
     * Additionally, simple expressions can be formed using logical operators -
     * `and` and `or`. The [SCIM RFC] has more details but we currently only
     * support simple expressions.
     *
     * [SCIM RFC]: https://tools.ietf.org/html/rfc7644#section-3.4.2.2
     */
    filter?: string;
    /**
     * Attribute to sort the results. Multi-part paths are supported. For
     * example, `userName`, `name.givenName`, and `emails`.
     */
    sortBy?: string;
    /**
     * The order to sort the results.
     */
    sortOrder?: ListSortOrder;
    /**
     * Specifies the index of the first result. First item is number 1.
     */
    startIndex?: number;
}

export interface ListUsersResponse {
    /**
     * Total results returned in the response.
     */
    itemsPerPage?: number;
    /**
     * User objects returned in the response.
     */
    Resources?: Array<User>;
    /**
     * Starting index of all the results that matched the request filters. First
     * item is number 1.
     */
    startIndex?: number;
    /**
     * Total results that match the request filters.
     */
    totalResults?: number;
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

export interface Name {
    /**
     * Family name of the Databricks user.
     */
    familyName?: string;
    /**
     * Given name of the Databricks user.
     */
    givenName?: string;
}

export interface ObjectPermissions {
    access_control_list?: Array<AccessControlResponse>;
    object_id?: string;
    object_type?: string;
}

export interface PartialUpdate {
    /**
     * Unique ID for a user in the Databricks workspace.
     */
    id: string;
    operations?: Array<Patch>;
}

export interface Patch {
    /**
     * Type of patch operation.
     */
    op?: PatchOp;
    /**
     * Selection of patch operation
     */
    path?: string;
    /**
     * Value to modify
     */
    value?: string;
}

/**
 * Type of patch operation.
 */
export type PatchOp = "add" | "remove" | "replace";

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

/**
 * A principal can be a user (for end users), a service principal (for
 * applications and compute workloads), or an account group. Each principal has
 * its own identifier format: * users/<USERNAME> * groups/<GROUP_NAME> *
 * servicePrincipals/<SERVICE_PRINCIPAL_APPLICATION_ID>
 */

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

export interface RuleSetResponse {
    /**
     * Identifies the version of the rule set returned.
     */
    etag?: string;
    grant_rules?: Array<GrantRule>;
    /**
     * Name of the rule set.
     */
    name?: string;
}

export interface RuleSetUpdateRequest {
    /**
     * The expected etag of the rule set to update. The update will fail if the
     * value does not match the value that is stored in account access control
     * service.
     */
    etag: string;
    grant_rules?: Array<GrantRule>;
    /**
     * Name of the rule set.
     */
    name: string;
}

export interface ServicePrincipal {
    /**
     * If this user is active
     */
    active?: boolean;
    /**
     * UUID relating to the service principal
     */
    applicationId?: string;
    /**
     * String that represents a concatenation of given and family names.
     */
    displayName?: string;
    entitlements?: Array<ComplexValue>;
    externalId?: string;
    groups?: Array<ComplexValue>;
    /**
     * Databricks service principal ID.
     */
    id?: string;
    roles?: Array<ComplexValue>;
}

export interface UpdateRuleSetRequest {
    /**
     * Name of the rule set.
     */
    name: string;
    rule_set: RuleSetUpdateRequest;
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

export interface User {
    /**
     * If this user is active
     */
    active?: boolean;
    /**
     * String that represents a concatenation of given and family names. For
     * example `John Smith`.
     */
    displayName?: string;
    /**
     * All the emails associated with the Databricks user.
     */
    emails?: Array<ComplexValue>;
    entitlements?: Array<ComplexValue>;
    externalId?: string;
    groups?: Array<ComplexValue>;
    /**
     * Databricks user ID.
     */
    id?: string;
    name?: Name;
    roles?: Array<ComplexValue>;
    /**
     * Email address of the Databricks user.
     */
    userName?: string;
}

export type WorkspacePermission = "ADMIN" | "UNKNOWN" | "USER";

export interface WorkspacePermissions {
    /**
     * Array of permissions defined for a workspace.
     */
    permissions?: Array<PermissionOutput>;
}

export interface EmptyResponse {}
