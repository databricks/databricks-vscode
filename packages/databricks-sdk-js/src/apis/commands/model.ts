/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
export interface CancelCommand {
    clusterId?: string;
    commandId?: string;
    contextId?: string;
}

export interface Command {
    /**
     * Running cluster id
     */
    clusterId?: string;
    /**
     * Executable code
     */
    command?: string;
    /**
     * Running context id
     */
    contextId?: string;
    language?: Language;
}

export type CommandStatus =
    | "Cancelled"
    | "Cancelling"
    | "Error"
    | "Finished"
    | "Queued"
    | "Running";

/**
 * Get command info
 */
export interface CommandStatusRequest {
    clusterId: string;
    commandId: string;
    contextId: string;
}

export interface CommandStatusResponse {
    id?: string;
    results?: Results;
    status?: CommandStatus;
}

export type ContextStatus = "Error" | "Pending" | "Running";

/**
 * Get status
 */
export interface ContextStatusRequest {
    clusterId: string;
    contextId: string;
}

export interface ContextStatusResponse {
    id?: string;
    status?: ContextStatus;
}

export interface CreateContext {
    /**
     * Running cluster id
     */
    clusterId?: string;
    language?: Language;
}

export interface Created {
    id?: string;
}

export interface DestroyContext {
    clusterId: string;
    contextId: string;
}

export type Language = "python" | "scala" | "sql";

export type ResultType = "error" | "image" | "images" | "table" | "text";

export interface Results {
    /**
     * The cause of the error
     */
    cause?: string;
    data?: any /* MISSING TYPE */;
    /**
     * The image filename
     */
    fileName?: string;
    fileNames?: Array<string>;
    /**
     * true if a JSON schema is returned instead of a string representation of
     * the Hive type.
     */
    isJsonSchema?: boolean;
    /**
     * internal field used by SDK
     */
    pos?: number;
    resultType?: ResultType;
    /**
     * The table schema
     */
    schema?: Array<Record<string, any /* MISSING TYPE */>>;
    /**
     * The summary of the error
     */
    summary?: string;
    /**
     * true if partial results are returned.
     */
    truncated?: boolean;
}

export interface EmptyResponse {}
