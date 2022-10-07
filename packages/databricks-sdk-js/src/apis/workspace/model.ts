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
     * ``false`` by default. Please note this deleting directory is not atomic.
     * If it fails in the middle, some of objects under this directory may be
     * deleted and cannot be undone.
     */
    recursive?: boolean;
}

export interface ExportResponse {
    /**
     * The base64-encoded content. If the limit (10MB) is exceeded, exception
     * with error code **MAX_NOTEBOOK_SIZE_EXCEEDED** will be thrown.
     */
    content?: string;
}

export interface Import {
    /**
     * The base64-encoded content. This has a limit of 10 MB. If the limit (10MB)
     * is exceeded, exception with error code **MAX_NOTEBOOK_SIZE_EXCEEDED** will
     * be thrown. This parameter might be absent, and instead a posted file will
     * be used. See :ref:`workspace-api-import-example` for more information
     * about how to use it.
     */
    content?: string;
    /**
     * This specifies the format of the file to be imported. By default, this is
     * ``SOURCE``. However it may be one of: ``SOURCE``, ``HTML``, ``JUPYTER``,
     * ``DBC``. The value is case sensitive.
     */
    format?: ImportFormat;
    /**
     * The language. If format is set to ``SOURCE``, this field is required;
     * otherwise, it will be ignored.
     */
    language?: ImportLanguage;
    /**
     * The flag that specifies whether to overwrite existing object. It is
     * ``false`` by default. For ``DBC`` format, ``overwrite`` is not supported
     * since it may contain a directory.
     */
    overwrite?: boolean;
    /**
     * The absolute path of the notebook or directory. Importing directory is
     * only support for ``DBC`` format.
     */
    path: string;
}

/**
 * This specifies the format of the file to be imported. By default, this is
 * ``SOURCE``. However it may be one of: ``SOURCE``, ``HTML``, ``JUPYTER``,
 * ``DBC``. The value is case sensitive.
 */
export type ImportFormat = "DBC" | "HTML" | "JUPYTER" | "R_MARKDOWN" | "SOURCE";

/**
 * The language. If format is set to ``SOURCE``, this field is required;
 * otherwise, it will be ignored.
 */
export type ImportLanguage = "PYTHON" | "R" | "SCALA" | "SQL";

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
     * The location (bucket and prefix) enum value of the content blob. This
     * field is used in conjunction with the blob_path field to determine where
     * the blob is located.
     */
    blob_location?: ObjectInfoBlobLocation;
    /**
     * ========= File metadata. These values are set only if the object type is
     * ``FILE``. ===========//
     */
    blob_path?: string;
    /**
     * <content needed>
     */
    content_sha256_hex?: string;
    /**
     * <content needed>
     */
    created_at?: number;
    /**
     * The language of the object. This value is set only if the object type is
     * ``NOTEBOOK``.
     */
    language?: ObjectInfoLanguage;
    /**
     * <content needed>
     */
    metadata_version?: number;
    /**
     * <content needed>
     */
    modified_at?: number;
    /**
     * <content needed>
     */
    object_id?: number;
    /**
     * <content needed>
     */
    object_type?: ObjectInfoObjectType;
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
 * The location (bucket and prefix) enum value of the content blob. This field is
 * used in conjunction with the blob_path field to determine where the blob is
 * located.
 */
export type ObjectInfoBlobLocation = "DBFS_ROOT" | "INTERNAL_DBFS_JOBS";

/**
 * The language of the object. This value is set only if the object type is
 * ``NOTEBOOK``.
 */
export type ObjectInfoLanguage = "PYTHON" | "R" | "SCALA" | "SQL";

/**
 * <content needed>
 */
export type ObjectInfoObjectType =
    | "DIRECTORY"
    | "FILE"
    | "LIBRARY"
    | "MLFLOW_EXPERIMENT"
    | "NOTEBOOK"
    | "PROJECT"
    | "REPO";

export interface ExportRequest {
    /**
     * Flag to enable direct download. If it is ``true``, the response will be
     * the exported file itself. Otherwise, the response contains content as
     * base64 encoded string. See :ref:`workspace-api-export-example` for more
     * information about how to use it.
     */
    direct_download?: boolean;
    /**
     * This specifies the format of the exported file. By default, this is
     * ``SOURCE``. However it may be one of: ``SOURCE``, ``HTML``, ``JUPYTER``,
     * ``DBC``. The value is case sensitive.
     */
    format?: string;
    /**
     * The absolute path of the notebook or directory. Exporting directory is
     * only support for ``DBC`` format.
     */
    path: string;
}

export interface GetStatusRequest {
    /**
     * The absolute path of the notebook or directory.
     */
    path: string;
}

export interface ListRequest {
    /**
     * <content needed>
     */
    notebooks_modified_after?: number;
    /**
     * The absolute path of the notebook or directory.
     */
    path: string;
}

export interface DeleteResponse {}
export interface ImportResponse {}
export interface MkdirsResponse {}
