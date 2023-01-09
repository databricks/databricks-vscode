/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
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
export interface DeleteGroupRequest {
    /**
     * Unique ID for a group in the Databricks Account.
     */
    id: string;
}

/**
 * Delete a service principal
 */
export interface DeleteServicePrincipalRequest {
    /**
     * Unique ID for a service principal in the Databricks Account.
     */
    id: string;
}

/**
 * Delete a user
 */
export interface DeleteUserRequest {
    /**
     * Unique ID for a user in the Databricks Account.
     */
    id: string;
}

/**
 * Get group details
 */
export interface GetGroupRequest {
    /**
     * Unique ID for a group in the Databricks Account.
     */
    id: string;
}

/**
 * Get service principal details
 */
export interface GetServicePrincipalRequest {
    /**
     * Unique ID for a service principal in the Databricks Account.
     */
    id: string;
}

/**
 * Get user details
 */
export interface GetUserRequest {
    /**
     * Unique ID for a user in the Databricks Account.
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
     * Unique ID for a group in the Databricks Account.
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

export interface EmptyResponse {}
