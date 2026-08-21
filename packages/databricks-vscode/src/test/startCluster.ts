/* eslint-disable no-console */

import {
    ApiClient,
    Time,
    TimeUnits,
    compute,
    retry,
    retries,
} from "@databricks/sdk-experimental";

// Warms up the shared e2e test cluster from wdio's onPrepare, before any spec
// or session runs (a throw here aborts the whole shard — specFileRetries can't
// recover it). Deliberately duplicates the SDK retry() idiom rather than
// reusing the production Cluster.start() so the e2e path can own a long
// timeout (the shared cluster's cloud node placement has been seen taking ~1h)
// and tolerate the shared-cluster start race, without changing production.
export class ClusterStartError extends Error {}

const DEFAULT_START_TIMEOUT = new Time(60, TimeUnits.minutes);
const POLL_INTERVAL = new Time(10, TimeUnits.seconds);

export async function startCluster(
    client: ApiClient,
    clusterId: string,
    timeout: Time = DEFAULT_START_TIMEOUT
) {
    const clusterApi = new compute.ClustersService(client);
    const log = (c: compute.ClusterDetails) =>
        console.log(
            `Cluster ${clusterId} state: ${c.state}${
                c.state_message ? ` - ${c.state_message}` : ""
            }`
        );

    let cluster = await clusterApi.get({cluster_id: clusterId});
    log(cluster);
    if (cluster.state === "RUNNING") {
        return;
    }

    // If it's shutting down, wait for that to finish before restarting it.
    if (cluster.state === "TERMINATING") {
        await retry<void>({
            timeout,
            retryPolicy: new retries.LinearRetryPolicy(POLL_INTERVAL),
            fn: async () => {
                cluster = await clusterApi.get({cluster_id: clusterId});
                log(cluster);
                if (cluster.state === "TERMINATING") {
                    throw new retries.RetriableError();
                }
            },
        });
    }

    if (
        cluster.state === "TERMINATED" ||
        cluster.state === "ERROR" ||
        cluster.state === "UNKNOWN"
    ) {
        // The cluster is shared across ~40 shards: a sibling may have already
        // issued the start, racing this call into an "unexpected state" error.
        // Swallow it and let the poll below decide — a genuine failure lands the
        // cluster back in a terminal state, which the poll treats as fatal, so
        // this does not mask permanent failures.
        try {
            await clusterApi.start({cluster_id: clusterId});
        } catch (e) {
            console.log(
                `clusters.start on shared cluster ${clusterId}: ${
                    e instanceof Error ? e.message : String(e)
                }`
            );
        }
    }

    // Poll to RUNNING under one deadline. A terminal state here is a real launch
    // failure (the start was already issued), so fail fast with the cloud-side
    // reason instead of burning the whole timeout.
    await retry<void>({
        timeout,
        retryPolicy: new retries.LinearRetryPolicy(POLL_INTERVAL),
        fn: async () => {
            cluster = await clusterApi.get({cluster_id: clusterId});
            log(cluster);
            switch (cluster.state) {
                case "RUNNING":
                    return;
                case "TERMINATED":
                case "ERROR":
                    throw new ClusterStartError(
                        `Cluster ${clusterId} failed to start (${
                            cluster.state
                        }): ${JSON.stringify(
                            cluster.state_message ?? cluster.termination_reason
                        )}`
                    );
                default:
                    throw new retries.RetriableError();
            }
        },
    });
}
