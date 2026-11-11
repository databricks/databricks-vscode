import type { HttpRequest } from "@databricks/sdk-core/http";
import type { FakeHttpClient } from "./fakeHttp";

/* eslint-disable @typescript-eslint/naming-convention */

/** A cluster as the API sends it. */
export interface ApiCluster {
    cluster_id: string;
    cluster_name: string;
    state: string;
    state_message?: string;
    cluster_source?: string;
    creator_user_name?: string;
    spark_version?: string;
    cluster_memory_mb?: number;
    cluster_cores?: number;
    driver_node_type_id?: string;
    node_type_id?: string;
    num_workers?: number;
    autoscale?: { min_workers: number; max_workers: number };
    data_security_mode?: string;
    access_mode?: string;
    single_user_name?: string;
}

export function apiCluster(id: string, fields: Partial<ApiCluster> = {}): ApiCluster {
    return {
        cluster_id: id,
        cluster_name: `name-${id}`,
        state: "RUNNING",
        cluster_source: "UI",
        creator_user_name: "me",
        spark_version: "15.4.x-scala2.12",
        ...fields,
    };
}

async function body(request: HttpRequest): Promise<Record<string, unknown>> {
    const text =
        request.body === undefined
            ? ""
            : await new Response(request.body as ConstructorParameters<typeof Response>[0]).text();
    return text === "" ? {} : (JSON.parse(text) as Record<string, unknown>);
}

/**
 * The Clusters and Permissions APIs over an in-memory list, routed on a
 * `FakeHttpClient`. A started cluster reads `PENDING` for `startReads`
 * reads, then `RUNNING`; a stopped one reads `TERMINATING` for `stopReads`
 * reads, then `TERMINATED`. `pageSize` splits the list into pages.
 */
export class FakeClusters {
    readonly clusters = new Map<string, ApiCluster>();
    /** Permissions by cluster ID: `access_control_list` entries. */
    readonly permissions = new Map<string, { user_name?: string; group_name?: string }[]>();
    readonly starts: string[] = [];
    readonly stops: string[] = [];
    startReads = 1;
    stopReads = 1;
    pageSize = 100;
    /** Delays every list page, to test what shows while the list loads. */
    listDelay?: Promise<void>;
    private readonly pending = new Map<string, { next: string; reads: number }>();

    constructor(clusters: ApiCluster[] = []) {
        for (const c of clusters) {
            this.clusters.set(c.cluster_id, c);
        }
    }

    /** Routes the APIs on `http`, and returns it. */
    install(http: FakeHttpClient): FakeHttpClient {
        http.on("GET", "/api/2.1/clusters/list", async (request) => {
            await this.listDelay;
            const url = new URL(request.url);
            const sources = url.searchParams.getAll("filter_by.cluster_sources");
            const all = [...this.clusters.values()].filter(
                (c) => sources.length === 0 || sources.includes(c.cluster_source ?? ""),
            );
            const start = Number(url.searchParams.get("page_token") ?? 0);
            const page = all.slice(start, start + this.pageSize);
            const next =
                start + this.pageSize < all.length ? String(start + this.pageSize) : undefined;
            return {
                body: { clusters: page, ...(next !== undefined ? { next_page_token: next } : {}) },
            };
        });
        http.on("GET", "/api/2.1/clusters/get", (request) => {
            const id = new URL(request.url).searchParams.get("cluster_id") ?? "";
            const cluster = this.read(id);
            return cluster === undefined
                ? {
                      status: 404,
                      body: {
                          error_code: "RESOURCE_DOES_NOT_EXIST",
                          message: `Cluster ${id} does not exist`,
                      },
                  }
                : { body: cluster };
        });
        http.on("POST", "/api/2.1/clusters/start", async (request) => {
            const id = String((await body(request)).cluster_id);
            this.starts.push(id);
            this.transition(id, "PENDING", "RUNNING", this.startReads);
            return { body: {} };
        });
        http.on("POST", "/api/2.1/clusters/delete", async (request) => {
            const id = String((await body(request)).cluster_id);
            this.stops.push(id);
            this.transition(id, "TERMINATING", "TERMINATED", this.stopReads);
            return { body: {} };
        });
        http.onPrefix("GET", "/api/2.0/permissions/clusters/", (request) => {
            const id = new URL(request.url).pathname.split("/").at(-1)!;
            return {
                body: {
                    object_id: `/clusters/${id}`,
                    object_type: "cluster",
                    access_control_list: this.permissions.get(id) ?? [],
                },
            };
        });
        return http;
    }

    private transition(id: string, now: string, next: string, reads: number) {
        const cluster = this.clusters.get(id);
        if (cluster !== undefined) {
            cluster.state = now;
            this.pending.set(id, { next, reads });
        }
    }

    private read(id: string): ApiCluster | undefined {
        const cluster = this.clusters.get(id);
        const pending = this.pending.get(id);
        if (cluster !== undefined && pending !== undefined) {
            if (pending.reads <= 0) {
                cluster.state = pending.next;
                this.pending.delete(id);
            } else {
                pending.reads--;
            }
        }
        return cluster === undefined ? undefined : { ...cluster };
    }
}
