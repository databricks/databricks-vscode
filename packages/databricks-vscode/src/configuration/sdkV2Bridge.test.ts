/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import http from "node:http";
import type {AddressInfo} from "node:net";
import {tmpdir} from "node:os";
import type {RequestOptions} from "node:https";
import path from "node:path";
import {ApiClient, Config} from "@databricks/sdk-experimental";
import {AiGatewayClient} from "@databricks/sdk-aigateway/v1";
import {anything, instance, mock, when} from "ts-mockito";
import {v1FetchHttpClient, v2ClientOptions, v2Credentials} from "./sdkV2Bridge";

async function withEnv<T>(
    env: Record<string, string>,
    run: () => Promise<T>
): Promise<T> {
    const saved = Object.keys(env).map((name) => process.env[name]);
    Object.assign(process.env, env);
    try {
        return await run();
    } finally {
        Object.keys(env).forEach((name, i) => {
            if (saved[i] === undefined) {
                delete process.env[name];
            } else {
                process.env[name] = saved[i];
            }
        });
    }
}

describe(__filename, () => {
    let mockConfig: Config;
    let config: Config;
    let server: http.Server;
    let host: URL;
    let received: {headers: http.IncomingHttpHeaders; body: string}[];
    /** Resolves with a request to `/hang`, which is never answered. */
    let hung: Promise<http.IncomingMessage>;

    beforeEach(async () => {
        mockConfig = mock(Config);
        when(mockConfig.authType).thenReturn("azure-cli");
        when(mockConfig.workspaceId).thenReturn(undefined);
        when(mockConfig.authenticate(anything())).thenCall(
            async (headers: Headers) => {
                headers.set("Authorization", "Bearer v1-token");
                headers.set("X-Databricks-Azure-SP-Management-Token", "mgmt");
            }
        );
        config = instance(mockConfig);
        received = [];
        let hang: (request: http.IncomingMessage) => void;
        hung = new Promise((resolve) => (hang = resolve));
        server = http.createServer((request, response) => {
            if (request.url === "/hang") {
                return hang(request);
            }
            let body = "";
            request.on("data", (chunk) => (body += chunk));
            request.on("end", () => {
                received.push({headers: request.headers, body});
                response.writeHead(200, {"content-type": "application/json"});
                response.end(
                    JSON.stringify({
                        model_services: [
                            {
                                name: "model-services/system.ai.probe",
                                supported_api_types: ["mlflow/v1/responses"],
                            },
                        ],
                    })
                );
            });
        });
        await new Promise<void>((resolve) =>
            server.listen(0, "127.0.0.1", resolve)
        );
        host = new URL(
            `http://127.0.0.1:${(server.address() as AddressInfo).port}`
        );
    });

    afterEach(async () => {
        await new Promise((resolve) => server.close(resolve));
    });

    describe("v2Credentials", () => {
        it("returns the headers v1 authenticates with", async () => {
            const credentials = v2Credentials(config);

            assert.equal(credentials.name(), "azure-cli");
            assert.deepStrictEqual(await credentials.authHeaders(), [
                {key: "authorization", value: "Bearer v1-token"},
                {key: "x-databricks-azure-sp-management-token", value: "mgmt"},
            ]);
        });
    });

    describe("v2ClientOptions", () => {
        async function listModelServices() {
            // Any V2 client exercises the options; this is the one installed.
            const apiClient = new ApiClient(config, {
                product: "databricks-vscode",
                productVersion: "1.2.3",
            });
            const client = new AiGatewayClient(
                v2ClientOptions(apiClient, host)
            );
            const names: (string | undefined)[] = [];
            for await (const service of client.listModelServicesIter({
                parent: "schemas/system.ai",
            })) {
                names.push(service.name);
            }
            return names;
        }

        it("calls the host with v1 auth and the workspace id", async () => {
            when(mockConfig.workspaceId).thenReturn("1234");

            assert.deepStrictEqual(await listModelServices(), [
                "model-services/system.ai.probe",
            ]);
            assert.equal(received[0].headers.authorization, "Bearer v1-token");
            assert.equal(
                received[0].headers["x-databricks-workspace-id"],
                "1234"
            );
        });

        it("applies DATABRICKS_SDK_PROXY_STRICT_SSL to each request", async () => {
            const rejectUnauthorized: unknown[] = [];
            const request = http.request;
            http.request = ((...args: Parameters<typeof http.request>) => {
                const options = args.find(
                    (arg): arg is RequestOptions =>
                        typeof arg === "object" && !(arg instanceof URL)
                );
                rejectUnauthorized.push(options?.rejectUnauthorized);
                return request(...args);
            }) as typeof http.request;
            try {
                await withEnv(
                    {DATABRICKS_SDK_PROXY_STRICT_SSL: "false"},
                    listModelServices
                );
            } finally {
                http.request = request;
            }

            assert.deepStrictEqual(rejectUnauthorized, [false]);
        });

        it("sends the v1 client's product as the User-Agent", async () => {
            await listModelServices();

            const userAgent = received[0].headers["user-agent"] ?? "";
            assert.ok(userAgent.includes("databricks-vscode/1.2.3"), userAgent);
        });

        it("ignores DATABRICKS_* variables", async () => {
            await withEnv(
                {
                    DATABRICKS_HOST: "https://other.cloud.databricks.com",
                    DATABRICKS_WORKSPACE_ID: "2222",
                },
                listModelServices
            );

            assert.equal(received.length, 1);
            assert.equal(
                received[0].headers["x-databricks-workspace-id"],
                undefined
            );
        });

        it("ignores the config file", async () => {
            const dir = mkdtempSync(path.join(tmpdir(), "sdk-v2-bridge-"));
            const configFile = path.join(dir, ".databrickscfg");
            writeFileSync(
                configFile,
                "[DEFAULT]\nhost = https://other.cloud.databricks.com\nworkspace_id = 1111\n"
            );
            try {
                await withEnv(
                    {DATABRICKS_CONFIG_FILE: configFile},
                    listModelServices
                );

                assert.equal(
                    received[0].headers["x-databricks-workspace-id"],
                    undefined
                );
            } finally {
                rmSync(dir, {recursive: true, force: true});
            }
        });
    });
    describe("v1FetchHttpClient", () => {
        it("sends byte bodies", async () => {
            const send = (body: Uint8Array | ArrayBuffer) =>
                v1FetchHttpClient().send({
                    url: host.toString(),
                    method: "POST",
                    headers: new Headers(),
                    body,
                });

            // Only the view's bytes, not its whole buffer.
            await send(new TextEncoder().encode("[view]").subarray(1, 5));
            await send(new TextEncoder().encode("buffer").buffer);

            assert.deepStrictEqual(
                received.map(({body}) => body),
                ["view", "buffer"]
            );
        });

        it("aborts a request in flight when the signal fires", async () => {
            const controller = new AbortController();
            const sent = v1FetchHttpClient().send({
                url: new URL("/hang", host).toString(),
                method: "GET",
                headers: new Headers(),
                signal: controller.signal,
            });
            const request = await hung;
            const closed = new Promise((resolve) =>
                request.socket.on("close", resolve)
            );

            controller.abort();

            await assert.rejects(sent, {name: "AbortError"});
            await closed;
        });
    });
});
