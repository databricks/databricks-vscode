/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
export interface CreateIpAccessList {
    /**
     * Array of IP addresses or CIDR values to be added to the IP access list.
     */
    ip_addresses: Array<string>;
    /**
     * Label for the IP access list. This **cannot** be empty.
     */
    label: string;
    /**
     * This describes an enum
     */
    list_type: ListType;
}

export interface CreateIpAccessListResponse {
    ip_access_list?: IpAccessListInfo;
}

export interface CreateOboTokenRequest {
    /**
     * Application ID of the service principal.
     */
    application_id: string;
    /**
     * Comment that describes the purpose of the token.
     */
    comment?: string;
    /**
     * The number of seconds before the token expires.
     */
    lifetime_seconds: number;
}

export interface CreateOboTokenResponse {
    token_info?: TokenInfo;
    /**
     * Value of the token.
     */
    token_value?: string;
}

export interface CreateTokenRequest {
    /**
     * Optional description to attach to the token.
     */
    comment?: string;
    /**
     * The lifetime of the token, in seconds.
     *
     * If the ifetime is not specified, this token remains valid indefinitely.
     */
    lifetime_seconds?: number;
}

export interface CreateTokenResponse {
    /**
     * The information for the new token.
     */
    token_info?: PublicTokenInfo;
    /**
     * The value of the new token.
     */
    token_value?: string;
}

/**
 * Delete access list
 */
export interface DeleteAccountIpAccessListRequest {
    /**
     * The ID for the corresponding IP access list.
     */
    ip_access_list_id: string;
}

/**
 * Delete access list
 */
export interface DeleteIpAccessListRequest {
    /**
     * The ID for the corresponding IP access list to modify.
     */
    ip_access_list_id: string;
}

/**
 * Delete Personal Compute setting
 */
export interface DeletePersonalComputeSettingRequest {
    /**
     * etag used for versioning. The response is at least as fresh as the eTag
     * provided. This is used for optimistic concurrency control as a way to help
     * prevent simultaneous writes of a setting overwriting each other. It is
     * strongly suggested that systems make use of the etag in the read -> delete
     * pattern to perform setting deletions in order to avoid race conditions.
     * That is, get an etag from a GET request, and pass it with the DELETE
     * request to identify the rule set version you are deleting.
     */
    etag: string;
}

export interface DeletePersonalComputeSettingResponse {
    /**
     * etag used for versioning. The response is at least as fresh as the eTag
     * provided. This is used for optimistic concurrency control as a way to help
     * prevent simultaneous writes of a setting overwriting each other. It is
     * strongly suggested that systems make use of the etag in the read -> update
     * pattern to perform setting updates in order to avoid race conditions. That
     * is, get an etag from a GET request, and pass it with the PATCH request to
     * identify the setting version you are updating.
     */
    etag: string;
}

/**
 * Delete a token
 */
export interface DeleteTokenManagementRequest {
    /**
     * The ID of the token to get.
     */
    token_id: string;
}

export interface FetchIpAccessListResponse {
    ip_access_list?: IpAccessListInfo;
}

/**
 * Get IP access list
 */
export interface GetAccountIpAccessListRequest {
    /**
     * The ID for the corresponding IP access list.
     */
    ip_access_list_id: string;
}

/**
 * Get access list
 */
export interface GetIpAccessListRequest {
    /**
     * The ID for the corresponding IP access list to modify.
     */
    ip_access_list_id: string;
}

export interface GetIpAccessListResponse {
    ip_access_lists?: Array<IpAccessListInfo>;
}

export interface GetIpAccessListsResponse {
    ip_access_lists?: Array<IpAccessListInfo>;
}

/**
 * Check configuration status
 */
export interface GetStatusRequest {
    keys: string;
}

/**
 * Get token info
 */
export interface GetTokenManagementRequest {
    /**
     * The ID of the token to get.
     */
    token_id: string;
}

export interface IpAccessListInfo {
    /**
     * Total number of IP or CIDR values.
     */
    address_count?: number;
    /**
     * Creation timestamp in milliseconds.
     */
    created_at?: number;
    /**
     * User ID of the user who created this list.
     */
    created_by?: number;
    /**
     * Specifies whether this IP access list is enabled.
     */
    enabled?: boolean;
    /**
     * Array of IP addresses or CIDR values to be added to the IP access list.
     */
    ip_addresses?: Array<string>;
    /**
     * Label for the IP access list. This **cannot** be empty.
     */
    label?: string;
    /**
     * Universally unique identifier (UUID) of the IP access list.
     */
    list_id?: string;
    /**
     * This describes an enum
     */
    list_type?: ListType;
    /**
     * Update timestamp in milliseconds.
     */
    updated_at?: number;
    /**
     * User ID of the user who updated this list.
     */
    updated_by?: number;
}

/**
 * List all tokens
 */
export interface ListTokenManagementRequest {
    /**
     * User ID of the user that created the token.
     */
    created_by_id?: string;
    /**
     * Username of the user that created the token.
     */
    created_by_username?: string;
}

export interface ListTokensResponse {
    token_infos?: Array<TokenInfo>;
}

/**
 * This describes an enum
 */
export type ListType =
    /**
     * An allow list. Include this IP or range.
     */
    | "ALLOW"
    /**
     * A block list. Exclude this IP or range. IP addresses in the block list are
     * excluded even if they are included in an allow list.
     */
    | "BLOCK";

export interface PersonalComputeMessage {
    /**
     * ON: Grants all users in all workspaces access to the Personal Compute
     * default policy, allowing all users to create single-machine compute
     * resources. DELEGATE: Moves access control for the Personal Compute default
     * policy to individual workspaces and requires a workspace’s users or
     * groups to be added to the ACLs of that workspace’s Personal Compute
     * default policy before they will be able to create compute resources
     * through that policy.
     */
    value: PersonalComputeMessageEnum;
}

/**
 * ON: Grants all users in all workspaces access to the Personal Compute default
 * policy, allowing all users to create single-machine compute resources.
 * DELEGATE: Moves access control for the Personal Compute default policy to
 * individual workspaces and requires a workspace’s users or groups to be added
 * to the ACLs of that workspace’s Personal Compute default policy before they
 * will be able to create compute resources through that policy.
 */
export type PersonalComputeMessageEnum = "DELEGATE" | "ON";

export interface PersonalComputeSetting {
    /**
     * etag used for versioning. The response is at least as fresh as the eTag
     * provided. This is used for optimistic concurrency control as a way to help
     * prevent simultaneous writes of a setting overwriting each other. It is
     * strongly suggested that systems make use of the etag in the read -> update
     * pattern to perform setting updates in order to avoid race conditions. That
     * is, get an etag from a GET request, and pass it with the PATCH request to
     * identify the setting version you are updating.
     */
    etag?: string;
    personal_compute: PersonalComputeMessage;
    /**
     * Name of the corresponding setting. Needs to be 'default' if there is only
     * one setting instance per account.
     */
    setting_name?: string;
}

export interface PublicTokenInfo {
    /**
     * Comment the token was created with, if applicable.
     */
    comment?: string;
    /**
     * Server time (in epoch milliseconds) when the token was created.
     */
    creation_time?: number;
    /**
     * Server time (in epoch milliseconds) when the token will expire, or -1 if
     * not applicable.
     */
    expiry_time?: number;
    /**
     * The ID of this token.
     */
    token_id?: string;
}

/**
 * Get Personal Compute setting
 */
export interface ReadPersonalComputeSettingRequest {
    /**
     * etag used for versioning. The response is at least as fresh as the eTag
     * provided. This is used for optimistic concurrency control as a way to help
     * prevent simultaneous writes of a setting overwriting each other. It is
     * strongly suggested that systems make use of the etag in the read -> delete
     * pattern to perform setting deletions in order to avoid race conditions.
     * That is, get an etag from a GET request, and pass it with the DELETE
     * request to identify the rule set version you are deleting.
     */
    etag: string;
}

export interface ReplaceIpAccessList {
    /**
     * Specifies whether this IP access list is enabled.
     */
    enabled: boolean;
    /**
     * The ID for the corresponding IP access list to modify.
     */
    ip_access_list_id: string;
    /**
     * Array of IP addresses or CIDR values to be added to the IP access list.
     */
    ip_addresses: Array<string>;
    /**
     * Label for the IP access list. This **cannot** be empty.
     */
    label: string;
    /**
     * Universally unique identifier (UUID) of the IP access list.
     */
    list_id?: string;
    /**
     * This describes an enum
     */
    list_type: ListType;
}

export interface RevokeTokenRequest {
    /**
     * The ID of the token to be revoked.
     */
    token_id: string;
}

export interface TokenInfo {
    /**
     * Comment that describes the purpose of the token, specified by the token
     * creator.
     */
    comment?: string;
    /**
     * User ID of the user that created the token.
     */
    created_by_id?: number;
    /**
     * Username of the user that created the token.
     */
    created_by_username?: string;
    /**
     * Timestamp when the token was created.
     */
    creation_time?: number;
    /**
     * Timestamp when the token expires.
     */
    expiry_time?: number;
    /**
     * User ID of the user that owns the token.
     */
    owner_id?: number;
    /**
     * ID of the token.
     */
    token_id?: string;
}

export interface UpdateIpAccessList {
    /**
     * Specifies whether this IP access list is enabled.
     */
    enabled: boolean;
    /**
     * The ID for the corresponding IP access list to modify.
     */
    ip_access_list_id: string;
    /**
     * Array of IP addresses or CIDR values to be added to the IP access list.
     */
    ip_addresses: Array<string>;
    /**
     * Label for the IP access list. This **cannot** be empty.
     */
    label: string;
    /**
     * Universally unique identifier (UUID) of the IP access list.
     */
    list_id?: string;
    /**
     * This describes an enum
     */
    list_type: ListType;
}

/**
 * Update Personal Compute setting
 */
export interface UpdatePersonalComputeSettingRequest {
    /**
     * This should always be set to true for Settings RPCs. Added for AIP
     * compliance.
     */
    allow_missing?: boolean;
    setting?: PersonalComputeSetting;
}

export type WorkspaceConf = Record<string, string>;
