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

    // One deadline across both the shutdown wait and the start poll, so a slow
    // TERMINATING phase can't hand the poll a fresh full timeout and let the
    // total exceed the caller's bound.
    const deadline = Date.now() + timeout.toMillSeconds().value;
    const remaining = () =>
        new Time(Math.max(0, deadline - Date.now()), TimeUnits.milliseconds);

    let cluster = await clusterApi.get({cluster_id: clusterId});
    log(cluster);
    if (cluster.state === "RUNNING") {
        return;
    }

    // If it's shutting down, wait for that to finish before restarting it.
    if (cluster.state === "TERMINATING") {
        await retry<void>({
            timeout: remaining(),
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
        try {
            await clusterApi.start({cluster_id: clusterId});
        } catch (e) {
            // The cluster is shared across ~40 shards, so a sibling may have
            // already started it, racing this call into an error. Re-check: if
            // it's now coming up we merely raced, so poll below; if it's still
            // stopped the start genuinely failed (auth, permissions, bad
            // request), so surface that actionable error rather than mask it.
            cluster = await clusterApi.get({cluster_id: clusterId});
            log(cluster);
            if (
                cluster.state === "TERMINATED" ||
                cluster.state === "ERROR" ||
                cluster.state === "UNKNOWN"
            ) {
                throw e;
            }
        }
    }

    // Poll to RUNNING under one deadline. A terminal state here is a real launch
    // failure (the start was already issued), so fail fast with the cloud-side
    // reason instead of burning the whole timeout.
    await retry<void>({
        timeout: remaining(),
        retryPolicy: new retries.LinearRetryPolicy(POLL_INTERVAL),
        fn: async () => {
            cluster = await clusterApi.get({cluster_id: clusterId});
            log(cluster);
            switch (cluster.state) {
                case "RUNNING":
                    return;
                case "TERMINATED":
                case "ERROR":
                case "UNKNOWN": {
                    // state_message is a string; termination_reason is an
                    // object — stringify only the latter so a plain message
                    // isn't wrapped in quotes.
                    const reason =
                        cluster.state_message ??
                        cluster.termination_reason ??
                        "unknown reason";
                    throw new ClusterStartError(
                        `Cluster ${clusterId} failed to start (${
                            cluster.state
                        }): ${
                            typeof reason === "string"
                                ? reason
                                : JSON.stringify(reason)
                        }`
                    );
                }
                default:
                    throw new retries.RetriableError();
            }
        },
    });
}
