import type { CallOptions } from "@databricks/sdk-options/call";
import type { ClientOptions } from "@databricks/sdk-options/client";
import { z } from "zod";
import { getJson } from "./getJson";
import type { ClusterDetails } from "../compute/clusters";

/*
 * A gap client. `@databricks/sdk-clusters` 0.52.0 lists
 * clusters, but its request has no `filter_by` and its schema drops
 * `cluster_source` and `access_mode`. Without the filter the list holds
 * every job cluster of the last 30 days, which can't be attached; the old
 * extension asked for `UI` and `API` clusters only. This client calls the
 * same endpoint with that filter. Getting, starting and stopping a cluster
 * go through the SDK. Like an SDK client it is built by `ApiClients.get`,
 * and shares the connection's host, credentials and transport.
 */

const cluster = z
    .looseObject({
        cluster_id: z.string().optional(),
        cluster_name: z.string().optional(),
        state: z.string().optional(),
        state_message: z.string().optional(),
        creator_user_name: z.string().optional(),
        spark_version: z.string().optional(),
        cluster_memory_mb: z.number().optional(),
        cluster_cores: z.number().optional(),
        driver_node_type_id: z.string().optional(),
        node_type_id: z.string().optional(),
        num_workers: z.number().optional(),
        autoscale: z
            .looseObject({ min_workers: z.number().optional(), max_workers: z.number().optional() })
            .optional(),
        access_mode: z.string().optional(),
        data_security_mode: z.string().optional(),
        single_user_name: z.string().optional(),
        cluster_source: z.string().optional(),
    })
    .transform((c): ClusterDetails => ({
        id: c.cluster_id ?? "",
        name: c.cluster_name ?? "",
        state: c.state ?? "UNKNOWN",
        stateMessage: c.state_message || undefined,
        creator: c.creator_user_name,
        sparkVersion: c.spark_version,
        memoryMb: c.cluster_memory_mb,
        cores: c.cluster_cores,
        driverNodeTypeId: c.driver_node_type_id,
        nodeTypeId: c.node_type_id,
        workers:
            c.autoscale !== undefined
                ? { kind: "autoscale", min: c.autoscale.min_workers, max: c.autoscale.max_workers }
                : c.num_workers !== undefined
                  ? { kind: "fixed", count: c.num_workers }
                  : undefined,
        accessMode: c.access_mode ?? c.data_security_mode,
        singleUserName: c.single_user_name,
        source: c.cluster_source,
    }));

const listPage = z.looseObject({
    clusters: z.array(cluster).optional(),
    next_page_token: z.string().optional(),
});

/** The clusters a user can attach: those created in the UI or through the API. */
const ATTACHABLE_SOURCES = ["UI", "API"] as const;

export class ClusterListClient {
    constructor(private readonly options: ClientOptions) {}

    /**
     * `GET /api/2.1/clusters/list?filter_by.cluster_sources=UI&…=API`, page
     * by page. A cluster from another source is skipped too, in case a
     * workspace ignores the filter.
     */
    async *listIter(options: CallOptions = {}): AsyncGenerator<ClusterDetails> {
        let pageToken: string | undefined;
        const seen = new Set<string>();
        do {
            const page = await this.page(pageToken, options);
            for (const c of page.clusters ?? []) {
                if (
                    c.source === undefined ||
                    (ATTACHABLE_SOURCES as readonly string[]).includes(c.source)
                ) {
                    yield c;
                }
            }
            pageToken = page.next_page_token || undefined;
            if (pageToken !== undefined && seen.has(pageToken)) {
                // A repeated token would loop forever.
                return;
            }
            if (pageToken !== undefined) {
                seen.add(pageToken);
            }
        } while (pageToken !== undefined);
    }

    private async page(pageToken: string | undefined, options: CallOptions) {
        const { host } = this.options;
        if (host === undefined) {
            throw new Error("Host is required.");
        }
        const params = new URLSearchParams();
        for (const source of ATTACHABLE_SOURCES) {
            params.append("filter_by.cluster_sources", source);
        }
        if (pageToken !== undefined) {
            params.append("page_token", pageToken);
        }
        const url = `${host.replace(/\/+$/, "")}/api/2.1/clusters/list?${params.toString()}`;
        return getJson(this.options, url, listPage, options);
    }
}
