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
     * TBD
     */
    etag?: string;
}

export interface DeletePersonalComputeSettingResponse {
    /**
     * TBD
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
     * TBD
     */
    value: PersonalComputeMessageEnum;
}

/**
 * TBD
 */
export type PersonalComputeMessageEnum = "DELEGATE" | "ON";

export interface PersonalComputeSetting {
    /**
     * TBD
     */
    etag?: string;
    personal_compute: PersonalComputeMessage;
    /**
     * Name of the corresponding setting. Needs to be 'default' if the setting is
     * a singleton.
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
     * TBD
     */
    etag?: string;
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
     * TBD
     */
    allow_missing?: boolean;
    setting?: PersonalComputeSetting;
}

export type WorkspaceConf = Record<string, string>;

export interface EmptyResponse {}
