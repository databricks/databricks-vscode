import {ApiClient} from "../api-client";

export interface ScimMeRequest {}
export interface ScimMeResponse {
    entitlements: Array<{
        value: string;
    }>;
    schemas: Array<string>;
    roles: Array<{
        value: string;
    }>;
    groups: Array<{
        value: string;
    }>;
    userName: string;
}

export class ScimApi {
    constructor(readonly client: ApiClient) {}

    async me(req: ScimMeRequest): Promise<ScimMeResponse> {
        return (await this.client.request(
            "/api/2.0/preview/scim/v2/Me",
            "GET",
            req
        )) as ScimMeResponse;
    }

    // TODO: add missing calls
}
