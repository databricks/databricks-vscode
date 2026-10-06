/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import http from "node:http";
import {CancellationTokenSource} from "vscode";
import type {CancellationToken} from "vscode";
import {ApiClient, Config} from "@databricks/sdk-experimental";
import {AiGatewayClient} from "@databricks/sdk-aigateway/v1";
import {ApiError} from "@databricks/sdk-core/apierror";
import type {HttpRequest, HttpResponse} from "@databricks/sdk-core/http";
import {anything, instance, mock, when} from "ts-mockito";
import {v2ClientOptions} from "../configuration/sdkV2Bridge";
import {listUnityGatewayModels} from "./unityGatewayModels";

function jsonResponse(statusCode: number, body: unknown): HttpResponse {
    return {
        statusCode,
        headers: new Headers({"content-type": "application/json"}),
        body: new Response(JSON.stringify(body)).body,
    };
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe(__filename, () => {
    let requests: HttpRequest[];
    let respond: (request: HttpRequest) => Promise<HttpResponse>;
    let mockConfig: Config;

    function listModels(
        token: CancellationToken = new CancellationTokenSource().token,
        timeoutMs?: number
    ) {
        // A listing can outlive its test, so keep its requests apart.
        const sent = requests;
        const client = new AiGatewayClient({
            ...v2ClientOptions(
                new ApiClient(instance(mockConfig)),
                new URL("https://ws.cloud.databricks.com"),
                new http.Agent()
            ),
            httpClient: {
                send: (request) => {
                    sent.push(request);
                    return respond(request);
                },
            },
        });
        return listUnityGatewayModels(client, token, timeoutMs);
    }

    beforeEach(() => {
        requests = [];
        mockConfig = mock(Config);
    });

    it("lists the system.ai models on the unified Responses route", async () => {
        respond = async () =>
            jsonResponse(200, {
                model_services: [
                    {
                        name: "model-services/system.ai.gpt-5",
                        supported_api_types: [
                            "openai/v1/responses",
                            "mlflow/v1/responses",
                        ],
                    },
                    {
                        name: "system.ai.claude-sonnet",
                        supported_api_types: ["mlflow/v1/responses"],
                    },
                    {
                        name: "system.ai.grok",
                        supported_api_types: [
                            "mlflow/v1/chat/completions",
                            "openai/v1/responses",
                        ],
                    },
                    {
                        name: "system.ai.llama-chat",
                        supported_api_types: ["mlflow/v1/chat/completions"],
                    },
                    {
                        name: "system.ai.embeddings",
                        supported_api_types: ["openai/v1/embeddings"],
                    },
                    {name: "system.ai.no-routes"},
                    {supported_api_types: ["mlflow/v1/responses"]},
                ],
            });

        const models = await listModels();

        const url = new URL(requests[0].url);
        assert.equal(url.pathname, "/api/2.1/unity-catalog/model-services");
        assert.equal(url.searchParams.get("parent"), "schemas/system.ai");
        assert.deepStrictEqual(models, [
            {
                id: "system.ai.claude-sonnet",
                name: "claude-sonnet",
                family: "claude-sonnet",
                version: "1",
                detail: "Databricks",
                maxInputTokens: 128_000,
                maxOutputTokens: 4_096,
                capabilities: {toolCalling: true, imageInput: false},
                isUserSelectable: true,
            },
            {
                id: "system.ai.gpt-5",
                name: "gpt-5",
                family: "gpt-5",
                version: "1",
                detail: "Databricks",
                maxInputTokens: 128_000,
                maxOutputTokens: 4_096,
                capabilities: {toolCalling: true, imageInput: false},
                isUserSelectable: true,
            },
        ]);
    });

    it("lists every page", async () => {
        respond = async (request) =>
            new URL(request.url).searchParams.get("page_token") === "page-2"
                ? jsonResponse(200, {
                      model_services: [
                          {
                              name: "system.ai.b",
                              supported_api_types: ["mlflow/v1/responses"],
                          },
                      ],
                  })
                : jsonResponse(200, {
                      model_services: [
                          {
                              name: "system.ai.a",
                              supported_api_types: ["mlflow/v1/responses"],
                          },
                      ],
                      next_page_token: "page-2",
                  });

        const models = await listModels();

        assert.equal(requests.length, 2);
        assert.deepStrictEqual(
            models.map((model) => model.id),
            ["system.ai.a", "system.ai.b"]
        );
    });

    it("rejects with the API error", async () => {
        respond = async () =>
            jsonResponse(403, {
                error_code: "PERMISSION_DENIED",
                message: "User does not have USE CATALOG on system",
            });

        await assert.rejects(
            () => listModels(),
            (e: unknown) => e instanceof ApiError && e.httpStatusCode === 403
        );
    });

    it("aborts the request when cancelled", async () => {
        const tokenSource = new CancellationTokenSource();
        respond = (request) =>
            new Promise((resolve, reject) => {
                request.signal?.addEventListener("abort", () =>
                    reject(request.signal?.reason)
                );
                tokenSource.cancel();
            });

        await assert.rejects(() => listModels(tokenSource.token));
        assert.equal(requests[0].signal?.aborted, true);
    });

    describe("while getting a token hangs", () => {
        beforeEach(() => {
            when(mockConfig.authenticate(anything())).thenReturn(
                new Promise(() => {})
            );
        });

        it("times out", async () => {
            await assert.rejects(
                () => listModels(undefined, 10),
                (e: unknown) => e instanceof Error && e.name === "TimeoutError"
            );
            assert.equal(requests.length, 0);
        });

        it("stops when cancelled", async () => {
            const tokenSource = new CancellationTokenSource();
            const listing = listModels(tokenSource.token);
            tokenSource.cancel();

            await assert.rejects(() => listing);
        });
    });

    it("times out across all pages, not per page", async () => {
        respond = async (request) => {
            await delay(20);
            request.signal?.throwIfAborted();
            const page = Number(
                new URL(request.url).searchParams.get("page_token") ?? "1"
            );
            return jsonResponse(200, {
                model_services: [],
                next_page_token: page < 3 ? String(page + 1) : undefined,
            });
        };

        await assert.rejects(
            () => listModels(undefined, 40),
            (e: unknown) => e instanceof Error && e.name === "TimeoutError"
        );
    });
});
