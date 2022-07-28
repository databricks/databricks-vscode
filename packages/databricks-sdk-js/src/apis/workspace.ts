/* eslint-disable @typescript-eslint/naming-convention */

import {ApiClient} from "../api-client";
import * as notebook from "./notebook";
import * as file from "./file";

//
// Enums.
//

export type ObjectType =
    | "NOTEBOOK"
    | "DIRECTORY"
    | "LIBRARY"
    | "FILE"
    | "MLFLOW_EXPERIMENT"
    | "PROJECT"
    | "REPO";

//
// Subtypes used in request/response types.
//

export interface ObjectInfo {
    object_type?: ObjectType;
    path?: string;
    language?: notebook.Language;
    created_at?: number;
    modified_at?: number;
    object_id?: number;
    blob_path?: string;
    content_sha256_hex?: string;
    size?: number;
    metadata_version?: number;
    blob_location?: file.BlobLocation;
}

//
// Request/response types.
//

export interface MkdirsRequest {
    path: string;
}

export interface MkdirsResponse {}

export interface ListRequest {
    path: string;
    notebooks_modified_after?: number;
}

export interface ListResponse {
    objects?: Array<ObjectInfo>;
}

export interface ImportRequest {
    path: string;
    format?: notebook.ExportFormat;
    language?: notebook.Language;
    content?: string;
    overwrite?: boolean;
}

export interface ImportResponse {}

export interface ExportRequest {
    path: string;
    format?: notebook.ExportFormat;
    direct_download?: boolean;
}

export interface ExportResponse {
    content?: string;
}

export interface DeleteRequest {
    path: string;
    recursive?: boolean;
}

export interface DeleteResponse {}

export interface GetStatusRequest {
    path: string;
}

export interface GetStatusResponse {
    object_type?: ObjectType;
    path?: string;
    language?: notebook.Language;
    created_at?: number;
    modified_at?: number;
    object_id?: number;
    blob_path?: string;
    content_sha256_hex?: string;
    size?: number;
    metadata_version?: number;
    blob_location?: file.BlobLocation;
}

export class WorkspaceService {
    readonly client: ApiClient;

    constructor(client: ApiClient) {
        this.client = client;
    }

    async mkdirs(request: MkdirsRequest): Promise<MkdirsResponse> {
        return (await this.client.request(
            "/api/2.0/workspace/mkdirs",
            "POST",
            request
        )) as MkdirsResponse;
    }

    async list(request: ListRequest): Promise<ListResponse> {
        return (await this.client.request(
            "/api/2.0/workspace/list",
            "GET",
            request
        )) as ListResponse;
    }

    async import(request: ImportRequest): Promise<ImportResponse> {
        return (await this.client.request(
            "/api/2.0/workspace/import",
            "POST",
            request
        )) as ImportResponse;
    }

    async export(request: ExportRequest): Promise<ExportResponse> {
        return (await this.client.request(
            "/api/2.0/workspace/export",
            "GET",
            request
        )) as ExportResponse;
    }

    async delete(request: DeleteRequest): Promise<DeleteResponse> {
        return (await this.client.request(
            "/api/2.0/workspace/delete",
            "POST",
            request
        )) as DeleteResponse;
    }

    async getStatus(request: GetStatusRequest): Promise<GetStatusResponse> {
        return (await this.client.request(
            "/api/2.0/workspace/get-status",
            "GET",
            request
        )) as GetStatusResponse;
    }
}
