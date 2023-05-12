/* eslint-disable @typescript-eslint/naming-convention */
import { ApiClient } from "../api-client";
import { context, Context } from "../context";

export interface LakeSenseCompletionRequest {
    "@method": "byokChatCompletionRequest" | "openAiServiceChatCompletionRequest" | "enterpriseOpenAiServiceChatCompletionRequest",
    params: Record<string, any>
}
export interface LakeSenseCompletionResponse {
    completion: string;
}

export class LakeSenseService {
    constructor(readonly client: ApiClient) { }

    async completions(
        request: LakeSenseCompletionRequest,
        @context context?: Context
    ): Promise<LakeSenseCompletionResponse> {
        const path = "/api/2.0/lakesense-v2/chat/completions";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as LakeSenseCompletionResponse;
    }
}