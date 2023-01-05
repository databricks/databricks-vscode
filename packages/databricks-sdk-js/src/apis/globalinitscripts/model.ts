/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
export interface CreateResponse {
    /**
     * The global init script ID.
     */
    script_id?: string;
}

/**
 * Delete init script
 */
export interface Delete {
    /**
     * The ID of the global init script.
     */
    script_id: string;
}

/**
 * Get an init script
 */
export interface Get {
    /**
     * The ID of the global init script.
     */
    script_id: string;
}

export interface GlobalInitScriptCreateRequest {
    /**
     * Specifies whether the script is enabled. The script runs only if enabled.
     */
    enabled?: boolean;
    /**
     * The name of the script
     */
    name: string;
    /**
     * The position of a global init script, where 0 represents the first script
     * to run, 1 is the second script to run, in ascending order.
     *
     * If you omit the numeric position for a new global init script, it defaults
     * to last position. It will run after all current scripts. Setting any value
     * greater than the position of the last script is equivalent to the last
     * position. Example: Take three existing scripts with positions 0, 1, and 2.
     * Any position of (3) or greater puts the script in the last position. If an
     * explicit position value conflicts with an existing script value, your
     * request succeeds, but the original script at that position and all later
     * scripts have their positions incremented by 1.
     */
    position?: number;
    /**
     * The Base64-encoded content of the script.
     */
    script: string;
}

export interface GlobalInitScriptDetails {
    /**
     * Time when the script was created, represented as a Unix timestamp in
     * milliseconds.
     */
    created_at?: number;
    /**
     * The username of the user who created the script.
     */
    created_by?: string;
    /**
     * Specifies whether the script is enabled. The script runs only if enabled.
     */
    enabled?: boolean;
    /**
     * The name of the script
     */
    name?: string;
    /**
     * The position of a script, where 0 represents the first script to run, 1 is
     * the second script to run, in ascending order.
     */
    position?: number;
    /**
     * The global init script ID.
     */
    script_id?: string;
    /**
     * Time when the script was updated, represented as a Unix timestamp in
     * milliseconds.
     */
    updated_at?: number;
    /**
     * The username of the user who last updated the script
     */
    updated_by?: string;
}

export interface GlobalInitScriptDetailsWithContent {
    /**
     * Time when the script was created, represented as a Unix timestamp in
     * milliseconds.
     */
    created_at?: number;
    /**
     * The username of the user who created the script.
     */
    created_by?: string;
    /**
     * Specifies whether the script is enabled. The script runs only if enabled.
     */
    enabled?: boolean;
    /**
     * The name of the script
     */
    name?: string;
    /**
     * The position of a script, where 0 represents the first script to run, 1 is
     * the second script to run, in ascending order.
     */
    position?: number;
    /**
     * The Base64-encoded content of the script.
     */
    script?: string;
    /**
     * The global init script ID.
     */
    script_id?: string;
    /**
     * Time when the script was updated, represented as a Unix timestamp in
     * milliseconds.
     */
    updated_at?: number;
    /**
     * The username of the user who last updated the script
     */
    updated_by?: string;
}

export interface GlobalInitScriptUpdateRequest {
    /**
     * Specifies whether the script is enabled. The script runs only if enabled.
     */
    enabled?: boolean;
    /**
     * The name of the script
     */
    name: string;
    /**
     * The position of a script, where 0 represents the first script to run, 1 is
     * the second script to run, in ascending order. To move the script to run
     * first, set its position to 0.
     *
     * To move the script to the end, set its position to any value greater or
     * equal to the position of the last script. Example, three existing scripts
     * with positions 0, 1, and 2. Any position value of 2 or greater puts the
     * script in the last position (2).
     *
     * If an explicit position value conflicts with an existing script, your
     * request succeeds, but the original script at that position and all later
     * scripts have their positions incremented by 1.
     */
    position?: number;
    /**
     * The Base64-encoded content of the script.
     */
    script: string;
    /**
     * The ID of the global init script.
     */
    script_id: string;
}

export interface ListGlobalInitScriptsResponse {
    scripts?: Array<GlobalInitScriptDetails>;
}

export interface EmptyResponse {}
