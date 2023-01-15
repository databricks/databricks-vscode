/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
export interface Delete {
    /**
     * The absolute path of the notebook or directory.
     */
    path: string;
    /**
     * The flag that specifies whether to delete the object recursively. It is
     * `false` by default. Please note this deleting directory is not atomic. If
     * it fails in the middle, some of objects under this directory may be
     * deleted and cannot be undone.
     */
    recursive?: boolean;
}

/**
 * Export a notebook
 */
export interface Export {
    /**
     * Flag to enable direct download. If it is `true`, the response will be the
     * exported file itself. Otherwise, the response contains content as base64
     * encoded string.
     */
    direct_download?: boolean;
    /**
     * This specifies the format of the exported file. By default, this is
     * `SOURCE`. However it may be one of: `SOURCE`, `HTML`, `JUPYTER`, `DBC`.
     *
     * The value is case sensitive.
     */
    format?: ExportFormat;
    /**
     * The absolute path of the notebook or directory. Exporting directory is
     * only support for `DBC` format.
     */
    path: string;
}

/**
 * This specifies the format of the file to be imported. By default, this is
 * `SOURCE`. However it may be one of: `SOURCE`, `HTML`, `JUPYTER`, `DBC`. The
 * value is case sensitive.
 */
export type ExportFormat = "DBC" | "HTML" | "JUPYTER" | "R_MARKDOWN" | "SOURCE";

export interface ExportResponse {
    /**
     * The base64-encoded content. If the limit (10MB) is exceeded, exception
     * with error code **MAX_NOTEBOOK_SIZE_EXCEEDED** will be thrown.
     */
    content?: string;
}

/**
 * Get status
 */
export interface GetStatus {
    /**
     * The absolute path of the notebook or directory.
     */
    path: string;
}

export interface Import {
    /**
     * The base64-encoded content. This has a limit of 10 MB.
     *
     * If the limit (10MB) is exceeded, exception with error code
     * **MAX_NOTEBOOK_SIZE_EXCEEDED** will be thrown. This parameter might be
     * absent, and instead a posted file will be used.
     */
    content?: string;
    /**
     * This specifies the format of the file to be imported. By default, this is
     * `SOURCE`. However it may be one of: `SOURCE`, `HTML`, `JUPYTER`, `DBC`.
     * The value is case sensitive.
     */
    format?: ExportFormat;
    /**
     * The language of the object. This value is set only if the object type is
     * `NOTEBOOK`.
     */
    language?: Language;
    /**
     * The flag that specifies whether to overwrite existing object. It is
     * `false` by default. For `DBC` format, `overwrite` is not supported since
     * it may contain a directory.
     */
    overwrite?: boolean;
    /**
     * The absolute path of the notebook or directory. Importing directory is
     * only support for `DBC` format.
     */
    path: string;
}

/**
 * The language of the object. This value is set only if the object type is
 * `NOTEBOOK`.
 */
export type Language = "PYTHON" | "R" | "SCALA" | "SQL";

/**
 * List contents
 */
export interface List {
    /**
     * <content needed>
     */
    notebooks_modified_after?: number;
    /**
     * The absolute path of the notebook or directory.
     */
    path: string;
}

export interface ListResponse {
    /**
     * List of objects.
     */
    objects?: Array<ObjectInfo>;
}

export interface Mkdirs {
    /**
     * The absolute path of the directory. If the parent directories do not
     * exist, it will also create them. If the directory already exists, this
     * command will do nothing and succeed.
     */
    path: string;
}

export interface ObjectInfo {
    /**
     * <content needed>
     */
    created_at?: number;
    /**
     * The language of the object. This value is set only if the object type is
     * `NOTEBOOK`.
     */
    language?: Language;
    /**
     * <content needed>
     */
    modified_at?: number;
    /**
     * <content needed>
     */
    object_id?: number;
    /**
     * The type of the object in workspace.
     */
    object_type?: ObjectType;
    /**
     * The absolute path of the object.
     */
    path?: string;
    /**
     * <content needed>
     */
    size?: number;
}

/**
 * The type of the object in workspace.
 */
export type ObjectType = "DIRECTORY" | "FILE" | "LIBRARY" | "NOTEBOOK" | "REPO";

export interface EmptyResponse {}
