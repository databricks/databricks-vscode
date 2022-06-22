import {ApiClient} from "../api-client";

export type Language = "python" | "scala" | "sql";
interface ExecutionContextCreateRequest {
    clusterId: string;
    language: Language;
}

interface ExecutionContextCreateResponse {
    id: string;
}

interface ExecutionContextStatusRequest {
    clusterId: string;
    contextId: string;
}

interface ExecutionContextStatusResponse {
    id: string;
    status: "Error" | "Pending" | "Running";
}

interface ExecutionContextDestroyRequest {
    clusterId: string;
    contextId: string;
}

interface ExecutionContextDestroyResponse {
    id: string;
}

export class ExecutionContextApi {
    readonly client: ApiClient;

    constructor(client: ApiClient) {
        this.client = client;
    }

    async create(
        req: ExecutionContextCreateRequest
    ): Promise<ExecutionContextCreateResponse> {
        return (await this.client.request(
            "/api/1.2/contexts/create",
            "POST",
            req
        )) as ExecutionContextCreateResponse;
    }

    async status(
        req: ExecutionContextStatusRequest
    ): Promise<ExecutionContextStatusResponse> {
        return (await this.client.request(
            "/api/1.2/contexts/status",
            "GET",
            req
        )) as ExecutionContextStatusResponse;
    }

    async destroy(
        req: ExecutionContextDestroyRequest
    ): Promise<ExecutionContextDestroyResponse> {
        return (await this.client.request(
            "/api/1.2/contexts/destroy",
            "POST",
            req
        )) as ExecutionContextDestroyResponse;
    }
}
