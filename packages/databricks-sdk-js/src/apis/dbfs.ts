/* eslint-disable @typescript-eslint/naming-convention */

import {ApiClient} from "../api-client";

export interface DbfsPutRequest {
    path: string;
    contents: string;
    overwrite: boolean;
}

export interface DbfsPutResponse {}

export interface DbfsDeleteRequest {
    path: string;
}

export interface DbfsDeleteResponse {
    error_code?: string;
    message?: string;
}

export class DbfsService {
    constructor(readonly client: ApiClient) {}

    async put(req: DbfsPutRequest): Promise<DbfsPutResponse> {
        return (await this.client.request(
            "/api/2.0/dbfs/put",
            "POST",
            req
        )) as DbfsPutResponse;
    }

    async delete(req: DbfsDeleteRequest): Promise<DbfsDeleteResponse> {
        return (await this.client.request(
            "/api/2.0/dbfs/delete",
            "POST",
            req
        )) as DbfsDeleteResponse;
    }
}
