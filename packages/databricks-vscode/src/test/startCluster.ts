/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-console */

import {
    ApiClient,
    Time,
    TimeUnits,
    compute,
    retry,
    retries,
} from "@databricks/sdk-experimental";

// Warms up the shared e2e cluster from onPrepare (a throw here aborts the
// shard). Owns a long timeout — node placement has been seen taking ~1h, past
// the SDK default — and tolerates the shared-cluster start race.
export class ClusterStartError extends Error {}

const DEFAULT_START_TIMEOUT = new Time(60, TimeUnits.minutes);
const POLL_INTERVAL = new Time(10, TimeUnits.seconds);

// Warm-up is best-effort: the cold-started shared cluster can fail placement
// transiently, so retry start() a bounded number of times before surfacing.
const MAX_START_ATTEMPTS = 3;
const START_RETRY_BACKOFF = new Time(20, TimeUnits.seconds);

function isTerminal(state?: compute.State): boolean {
    return state === "TERMINATED" || state === "ERROR" || state === "UNKNOWN";
}

// Include both fields when present so a machine-readable code (e.g.
// CLOUD_PROVIDER_LAUNCH_FAILURE) isn't lost when state_message is generic or
// absent.
function terminationReason(cluster: compute.ClusterDetails): string {
    const parts: string[] = [];
    if (cluster.state_message) {
        parts.push(cluster.state_message);
    }
    if (cluster.termination_reason) {
        parts.push(JSON.stringify(cluster.termination_reason));
    }
    return parts.length > 0 ? parts.join(" ") : "unknown reason";
}

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

    // One deadline across the shutdown wait, all start attempts, and their
    // polls, so a slow phase can't hand a later step a fresh full timeout and
    // let the total exceed the caller's bound.
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

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_START_ATTEMPTS; attempt++) {
        // Backoff may have consumed the remaining time; don't launch past the
        // deadline.
        if (remaining().toMillSeconds().value <= 0) {
            break;
        }

        if (isTerminal(cluster.state)) {
            try {
                await clusterApi.start({cluster_id: clusterId});
            } catch (e) {
                // Shared cluster: a sibling may have raced this start() into an
                // error. If it's coming up we just raced (poll below); if still
                // terminal the start was genuinely rejected, so surface it.
                cluster = await clusterApi.get({cluster_id: clusterId});
                log(cluster);
                if (isTerminal(cluster.state)) {
                    throw e;
                }
            }
        }

        // On this cold-started shared cluster a post-start terminal state is
        // usually a transient placement failure, so retry a bounded number of
        // times rather than failing the whole shard.
        try {
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
                        case "UNKNOWN":
                            throw new ClusterStartError(
                                `Cluster ${clusterId} failed to start (${
                                    cluster.state
                                }): ${terminationReason(cluster)}`
                            );
                        default:
                            throw new retries.RetriableError();
                    }
                },
            });
            return;
        } catch (e) {
            // Only a post-start terminal (ClusterStartError) is retryable; a
            // stuck-PENDING poll timeout and the like are not.
            if (!(e instanceof ClusterStartError)) {
                throw e;
            }
            lastError = e;
            if (attempt >= MAX_START_ATTEMPTS) {
                break;
            }
            // Jittered backoff so ~40 shards don't re-issue start() in lockstep
            // (thundering herd). Capped by the remaining deadline.
            const backoffMs = Math.min(
                Math.round(
                    START_RETRY_BACKOFF.toMillSeconds().value *
                        (0.5 + Math.random())
                ),
                remaining().toMillSeconds().value
            );
            if (backoffMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, backoffMs));
            }
        }
    }

    throw (
        lastError ??
        new ClusterStartError(
            `Cluster ${clusterId} did not reach RUNNING within the timeout`
        )
    );
}
