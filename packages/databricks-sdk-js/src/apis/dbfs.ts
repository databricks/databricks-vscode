/* eslint-disable @typescript-eslint/naming-convention */

import {ApiClient} from "../api-client";

import * as delegate from "./delegate";

//
// Enums.
//

//
// Subtypes used in request/response types.
//

export interface FileInfo {
    path?: string;
    is_dir?: boolean;
    file_size?: number;
    modification_time?: number;
}

//
// Request/response types.
//

export interface ReadRequest {
    path: string;
    offset?: number;
    length?: number;
}

export interface ReadResponse {
    bytes_read?: number;
    data?: string;
}

export interface GetStatusRequest {
    path: string;
}

export interface GetStatusResponse {
    path?: string;
    is_dir?: boolean;
    file_size?: number;
    modification_time?: number;
}

export interface ListStatusRequest {
    path: string;
}

export interface ListStatusResponse {
    files?: Array<FileInfo>;
}

export interface PutRequest {
    path: string;
    contents?: string;
    overwrite?: boolean;
}

export interface PutResponse {}

export interface MkDirsRequest {
    path: string;
}

export interface MkDirsResponse {}

export interface MoveRequest {
    source_path: string;
    destination_path: string;
}

export interface MoveResponse {}

export interface DeleteRequest {
    path: string;
    recursive?: boolean;
}

export interface DeleteResponse {}

export interface CreateRequest {
    path: string;
    overwrite?: boolean;
}

export interface CreateResponse {
    handle?: number;
}

export interface AddBlockRequest {
    handle: number;
    data: string;
}

export interface AddBlockResponse {}

export interface CloseRequest {
    handle: number;
}

export interface CloseResponse {}

export class DbfsService {
    readonly client: ApiClient;

    constructor(client: ApiClient) {
        this.client = client;
    }

    async read(request: ReadRequest): Promise<ReadResponse> {
        return (await this.client.request(
            "/api/2.0/dbfs/read",
            "GET",
            request
        )) as ReadResponse;
    }

    async getStatus(request: GetStatusRequest): Promise<GetStatusResponse> {
        return (await this.client.request(
            "/api/2.0/dbfs/get-status",
            "GET",
            request
        )) as GetStatusResponse;
    }

    async list(request: ListStatusRequest): Promise<ListStatusResponse> {
        return (await this.client.request(
            "/api/2.0/dbfs/list",
            "GET",
            request
        )) as ListStatusResponse;
    }

    async put(request: PutRequest): Promise<PutResponse> {
        return (await this.client.request(
            "/api/2.0/dbfs/put",
            "POST",
            request
        )) as PutResponse;
    }

    async mkdirs(request: MkDirsRequest): Promise<MkDirsResponse> {
        return (await this.client.request(
            "/api/2.0/dbfs/mkdirs",
            "POST",
            request
        )) as MkDirsResponse;
    }

    async move(request: MoveRequest): Promise<MoveResponse> {
        return (await this.client.request(
            "/api/2.0/dbfs/move",
            "POST",
            request
        )) as MoveResponse;
    }

    async delete(request: DeleteRequest): Promise<DeleteResponse> {
        return (await this.client.request(
            "/api/2.0/dbfs/delete",
            "POST",
            request
        )) as DeleteResponse;
    }

    async create(request: CreateRequest): Promise<CreateResponse> {
        return (await this.client.request(
            "/api/2.0/dbfs/create",
            "POST",
            request
        )) as CreateResponse;
    }

    async addBlock(request: AddBlockRequest): Promise<AddBlockResponse> {
        return (await this.client.request(
            "/api/2.0/dbfs/add-block",
            "POST",
            request
        )) as AddBlockResponse;
    }

    async close(request: CloseRequest): Promise<CloseResponse> {
        return (await this.client.request(
            "/api/2.0/dbfs/close",
            "POST",
            request
        )) as CloseResponse;
    }
}
