import { newPatCredentials } from "@databricks/sdk-auth/credentials";
import { describe, expect, it } from "vitest";
import { setProduct } from "@databricks/sdk-core/clientinfo";
import { apiCluster, FakeClusters } from "../../test-support/fakeClusters";
import { FakeHttpClient } from "../../test-support/fakeHttp";
import { ApiClients, calls } from "./ApiClients";
import { ClusterListClient } from "./ClusterListClient";

function client(http: FakeHttpClient) {
    return new ApiClients({
        host: "https://a.cloud.databricks.com",
        credentials: newPatCredentials("dapi-1"),
        httpClient: http,
    }).get(ClusterListClient);
}

async function all<T>(iter: AsyncIterable<T>) {
    const items: T[] = [];
    for await (const item of iter) {
        items.push(item);
    }
    return items;
}

/* eslint-disable @typescript-eslint/naming-convention */
describe("ClusterListClient", () => {
    it("sends User-Agent with extension product name and version in requests", async () => {
        setProduct("databricks-vscode", "0.0.0");
        const http = new FakeHttpClient().on("GET", "/api/2.1/clusters/list", {
            body: { clusters: [apiCluster("a")] },
        });
        await all(client(http).listIter(calls.read()));
        expect(http.requests).toHaveLength(1);
        const userAgent = http.requests[0]!.headers?.get("User-Agent");
        expect(userAgent).toContain("databricks-vscode/0.0.0");
        expect(userAgent).toContain("auth/pat");
    });

    it("asks for UI and API clusters only, as the old extension did, and skips others", async () => {
        const http = new FakeHttpClient().on("GET", "/api/2.1/clusters/list", {
            body: {
                clusters: [
                    apiCluster("ui"),
                    apiCluster("api", { cluster_source: "API" }),
                    apiCluster("job", { cluster_source: "JOB" }),
                ],
            },
        });
        const clusters = await all(client(http).listIter(calls.read()));
        expect(clusters.map((c) => c.id)).toEqual(["ui", "api"]);
        const url = new URL(http.requests[0]!.url);
        expect(url.searchParams.getAll("filter_by.cluster_sources")).toEqual(["UI", "API"]);
    });

    it("follows the pages", async () => {
        const fake = new FakeClusters(["a", "b", "c", "d", "e"].map((id) => apiCluster(id)));
        fake.pageSize = 2;
        const http = fake.install(new FakeHttpClient());
        expect((await all(client(http).listIter(calls.read()))).map((c) => c.id)).toEqual([
            "a",
            "b",
            "c",
            "d",
            "e",
        ]);
        expect(http.requests).toHaveLength(3);
    });

    it("keeps the fields the SDK drops, and reads sizes and access modes", async () => {
        const http = new FakeHttpClient().on("GET", "/api/2.1/clusters/list", {
            body: {
                clusters: [
                    apiCluster("a", {
                        access_mode: "USER_ISOLATION",
                        data_security_mode: "SINGLE_USER",
                        autoscale: { min_workers: 1, max_workers: 4 },
                        cluster_memory_mb: 2048,
                        cluster_cores: 4,
                        state_message: "",
                    }),
                    apiCluster("b", {
                        num_workers: 2,
                        data_security_mode: "SINGLE_USER",
                        single_user_name: "me",
                    }),
                ],
            },
        });
        const [a, b] = await all(client(http).listIter(calls.read()));
        expect(a).toMatchObject({
            accessMode: "USER_ISOLATION",
            workers: { kind: "autoscale", min: 1, max: 4 },
            memoryMb: 2048,
            cores: 4,
            source: "UI",
        });
        expect(a!.stateMessage).toBeUndefined();
        expect(b).toMatchObject({
            accessMode: "SINGLE_USER",
            singleUserName: "me",
            workers: { kind: "fixed", count: 2 },
        });
    });

    it("stops on a repeated page token", async () => {
        const http = new FakeHttpClient().on("GET", "/api/2.1/clusters/list", {
            body: { clusters: [apiCluster("a")], next_page_token: "same" },
        });
        expect(await all(client(http).listIter(calls.read()))).toHaveLength(2);
    });
});
