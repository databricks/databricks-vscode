/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order

export interface AddBlockRequest {
    // The base64-encoded data to append to the stream. This has a limit of 1
    // MB.
    data: string;
    // The handle on an open stream.
    handle: number;
}
export const DefaultAddBlockRequest = {};

export interface CloseRequest {
    // The handle on an open stream.
    handle: number;
}
export const DefaultCloseRequest = {};

export interface CreateRequest {
    // The flag that specifies whether to overwrite existing file/files.
    overwrite: boolean;
    // The path of the new file. The path should be the absolute DBFS path (e.g.
    // "/mnt/foo.txt").
    path: string;
}
export const DefaultCreateRequest: Pick<CreateRequest, "overwrite"> = {
    overwrite: false,
};

export interface CreateResponse {
    // Handle which should subsequently be passed into the AddBlock and Close
    // calls when writing to a file through a stream.
    handle: number;
}
export const DefaultCreateResponse = {};

export interface DeleteRequest {
    // The path of the file or directory to delete. The path should be the
    // absolute DBFS path (e.g. "/mnt/foo/").
    path: string;
    // Whether or not to recursively delete the directory's contents. Deleting
    // empty directories can be done without providing the recursive flag.
    recursive: boolean;
}
export const DefaultDeleteRequest: Pick<DeleteRequest, "recursive"> = {
    recursive: false,
};

export interface FileInfo {
    // The length of the file in bytes or zero if the path is a directory.
    file_size: number;
    // True if the path is a directory.
    is_dir: boolean;
    // Last modification time of given file/dir in milliseconds since Epoch.
    modification_time: number;
    // The path of the file or directory.
    path: string;
}
export const DefaultFileInfo: Pick<FileInfo, "is_dir"> = {
    is_dir: false,
};

export interface GetStatusRequest {
    // The path of the file or directory. The path should be the absolute DBFS
    // path (e.g. "/mnt/foo/").
    path: string;
}
export const DefaultGetStatusRequest = {};

export interface GetStatusResponse {
    // The length of the file in bytes or zero if the path is a directory.
    file_size: number;
    // True if the path is a directory.
    is_dir: boolean;
    // Last modification time of given file/dir in milliseconds since Epoch.
    modification_time: number;
    // The path of the file or directory.
    path: string;
}
export const DefaultGetStatusResponse: Pick<GetStatusResponse, "is_dir"> = {
    is_dir: false,
};

export interface ListStatusRequest {
    // The path of the file or directory. The path should be the absolute DBFS
    // path (e.g. "/mnt/foo/").
    path: string;
}
export const DefaultListStatusRequest = {};

export interface ListStatusResponse {
    // A list of FileInfo's that describe contents of directory or file. See
    // example above.
    files: FileInfo[];
}
export const DefaultListStatusResponse = {};

export interface MkDirsRequest {
    // The path of the new directory. The path should be the absolute DBFS path
    // (e.g. "/mnt/foo/").
    path: string;
}
export const DefaultMkDirsRequest = {};

export interface MoveRequest {
    // The destination path of the file or directory. The path should be the
    // absolute DBFS path (e.g. "/mnt/bar/").
    destination_path: string;
    // The source path of the file or directory. The path should be the absolute
    // DBFS path (e.g. "/mnt/foo/").
    source_path: string;
}
export const DefaultMoveRequest = {};

export interface PutRequest {
    // This parameter might be absent, and instead a posted file will be used.
    contents: string;
    // The flag that specifies whether to overwrite existing file/files.
    overwrite: boolean;
    // The path of the new file. The path should be the absolute DBFS path (e.g.
    // "/mnt/foo/").
    path: string;
}
export const DefaultPutRequest: Pick<PutRequest, "overwrite"> = {
    overwrite: false,
};

export interface ReadRequest {
    // The number of bytes to read starting from the offset. This has a limit of
    // 1 MB, and a default value of 0.5 MB.
    length: number;
    // The offset to read from in bytes.
    offset: number;
    // The path of the file to read. The path should be the absolute DBFS path
    // (e.g. "/mnt/foo/").
    path: string;
}
export const DefaultReadRequest = {};

export interface ReadResponse {
    // The number of bytes read (could be less than ``length`` if we hit end of
    // file). This refers to number of bytes read in unencoded version (response
    // data is base64-encoded).
    bytes_read: number;
    // The base64-encoded contents of the file read.
    data: string;
}
export const DefaultReadResponse = {};

export interface AddBlockResponse {}
export interface CloseResponse {}
export interface DeleteResponse {}
export interface MkDirsResponse {}
export interface MoveResponse {}
export interface PutResponse {}
