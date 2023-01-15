/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
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

/**
 * Delete a token
 */
export interface Delete {
    /**
     * The ID of the token to get.
     */
    token_id: string;
}

/**
 * Get token info
 */
export interface Get {
    /**
     * The ID of the token to get.
     */
    token_id: string;
}

/**
 * List all tokens
 */
export interface List {
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

export interface EmptyResponse {}
