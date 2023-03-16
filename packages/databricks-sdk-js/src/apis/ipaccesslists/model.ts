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

/**
 * Delete access list
 */
export interface Delete {
    /**
     * The ID for the corresponding IP access list to modify.
     */
    ip_access_list_id: string;
}

export interface FetchIpAccessListResponse {
    ip_access_list?: IpAccessListInfo;
}

/**
 * Get access list
 */
export interface Get {
    /**
     * The ID for the corresponding IP access list to modify.
     */
    ip_access_list_id: string;
}

export interface GetIpAccessListResponse {
    ip_access_lists?: Array<IpAccessListInfo>;
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
     * Universally unique identifier(UUID) of the IP access list.
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
     * Universally unique identifier(UUID) of the IP access list.
     */
    list_id?: string;
    /**
     * This describes an enum
     */
    list_type: ListType;
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
     * Universally unique identifier(UUID) of the IP access list.
     */
    list_id?: string;
    /**
     * This describes an enum
     */
    list_type: ListType;
}

export interface EmptyResponse {}
