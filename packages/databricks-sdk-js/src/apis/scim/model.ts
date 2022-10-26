/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
export interface ComplexValue {
    $ref?: string;
    display?: string;
    primary?: boolean;
    type?: string;
    value?: string;
}

export interface DeleteGroupRequest {
    /**
     * Unique ID for a group in the <Workspace>.
     */
    id: string;
}

export interface DeleteServicePrincipalRequest {
    /**
     * Unique ID for a service principal in the <Workspace>.
     */
    id: string;
}

export interface DeleteUserRequest {
    /**
     * Unique ID for a user in the <Workspace>.
     */
    id: string;
}

export interface FetchGroupRequest {
    /**
     * Unique ID for a group in the <Workspace>.
     */
    id: string;
}

export interface FetchServicePrincipalRequest {
    /**
     * Unique ID for a service principal in the <Workspace>.
     */
    id: string;
}

export interface FetchUserRequest {
    /**
     * Unique ID for a user in the <Workspace>.
     */
    id: string;
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
     * `and` and `or`. The [SCIM
     * RFC](https://tools.ietf.org/html/rfc7644#section-3.4.2.2) has more details
     * but we currently only support simple expressions.
     */
    filter?: string;
    /**
     * Attribute to sort the results.
     */
    sortBy?: string;
    /**
     * The order to sort the results.
     */
    sortOrder?: ListGroupsSortOrder;
    /**
     * Specifies the index of the first result. First item is number 1.
     */
    startIndex?: number;
}

export interface ListGroupsResponse {
    /**
     * User objects returned in the response.
     */
    Resources?: Array<Group>;
    /**
     * Total results returned in the response.
     */
    itemsPerPage?: number;
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

export type ListGroupsSortOrder = "ascending" | "descending";

export interface ListServicePrincipalResponse {
    /**
     * User objects returned in the response.
     */
    Resources?: Array<ServicePrincipal>;
    /**
     * Total results returned in the response.
     */
    itemsPerPage?: number;
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
     * `and` and `or`. The [SCIM
     * RFC](https://tools.ietf.org/html/rfc7644#section-3.4.2.2) has more details
     * but we currently only support simple expressions.
     */
    filter?: string;
    /**
     * Attribute to sort the results.
     */
    sortBy?: string;
    /**
     * The order to sort the results.
     */
    sortOrder?: ListServicePrincipalsSortOrder;
    /**
     * Specifies the index of the first result. First item is number 1.
     */
    startIndex?: number;
}

export type ListServicePrincipalsSortOrder = "ascending" | "descending";

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
     * `and` and `or`. The [SCIM
     * RFC](https://tools.ietf.org/html/rfc7644#section-3.4.2.2) has more details
     * but we currently only support simple expressions.
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
    sortOrder?: ListUsersSortOrder;
    /**
     * Specifies the index of the first result. First item is number 1.
     */
    startIndex?: number;
}

export interface ListUsersResponse {
    /**
     * User objects returned in the response.
     */
    Resources?: Array<User>;
    /**
     * Total results returned in the response.
     */
    itemsPerPage?: number;
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

export type ListUsersSortOrder = "ascending" | "descending";

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

export interface PartialUpdate {
    /**
     * Unique ID for a group in the <Workspace>.
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
     * String that represents a concatenation of given and family names. For
     * example `John Smith`.
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

export interface DeleteGroupResponse {}
export interface DeleteServicePrincipalResponse {}
export interface DeleteUserResponse {}
export interface PatchGroupResponse {}
export interface PatchServicePrincipalResponse {}
export interface PatchUserResponse {}
export interface ReplaceGroupResponse {}
export interface ReplaceServicePrincipalResponse {}
export interface ReplaceUserResponse {}
