/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
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

export interface ListTokensResponse {
    /**
     * The information for each token.
     */
    token_infos?: Array<PublicTokenInfo>;
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

export interface RevokeTokenRequest {
    /**
     * The ID of the token to be revoked.
     */
    token_id: string;
}

export interface EmptyResponse {}
