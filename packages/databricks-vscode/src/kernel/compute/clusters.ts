import type { ClusterInfo } from "@databricks/sdk-clusters/v2";

/**
 * A cluster as the extension shows it: the fields of the old
 * `sdk-extensions/Cluster` that the rows, the picker and the filters read,
 * as plain data. Built from `@databricks/sdk-clusters` (`fromClusterInfo`)
 * or from the list gap client (`ClusterListClient`), so both read the same.
 */
export interface ClusterDetails {
    readonly id: string;
    readonly name: string;
    /** `RUNNING`, `PENDING`, `RESTARTING`, `RESIZING`, `TERMINATING`, `TERMINATED`, `ERROR` or `UNKNOWN`. */
    readonly state: string;
    readonly stateMessage?: string;
    readonly creator?: string;
    readonly sparkVersion?: string;
    readonly memoryMb?: number;
    readonly cores?: number;
    readonly driverNodeTypeId?: string;
    readonly nodeTypeId?: string;
    readonly workers?:
        | { readonly kind: "fixed"; readonly count: number }
        | { readonly kind: "autoscale"; readonly min?: number; readonly max?: number };
    /** `access_mode`, else `data_security_mode`, as the old `Cluster.accessMode` read it. */
    readonly accessMode?: string;
    readonly singleUserName?: string;
    /** `UI`, `API`, `JOB`, …; only the list reads it. */
    readonly source?: string;
}

export function fromClusterInfo(info: ClusterInfo): ClusterDetails {
    const size = info.size;
    return {
        id: info.clusterId ?? "",
        name: info.clusterName ?? "",
        state: info.state ?? "UNKNOWN",
        stateMessage: info.stateMessage || undefined,
        creator: info.creatorUserName,
        sparkVersion: info.sparkVersion,
        memoryMb: info.clusterMemoryMb === undefined ? undefined : Number(info.clusterMemoryMb),
        cores: info.clusterCores,
        driverNodeTypeId: info.driverNodeTypeId,
        nodeTypeId: info.nodeTypeId,
        workers:
            size?.$case === "autoscale"
                ? {
                      kind: "autoscale",
                      min: size.autoscale.minWorkers,
                      max: size.autoscale.maxWorkers,
                  }
                : size?.$case === "numWorkers"
                  ? { kind: "fixed", count: size.numWorkers }
                  : undefined,
        accessMode: info.dataSecurityMode,
        singleUserName: info.singleUserName,
    };
}

/** `13.3.x-scala2.12` → `[13, 3, "x"]`, as the old `Cluster.dbrVersion`. */
export function dbrVersion(sparkVersion: string | undefined): Array<number | "x"> {
    const match = sparkVersion?.match(/^(custom:.*?__)?(.*?)-/);
    if (!match) {
        return ["x", "x", "x"];
    }
    const parts = match[2].split(".");
    return [0, 1, 2].map((i) => parseInt(parts[i] ?? "", 10) || "x");
}

const SINGLE_USER_MODES = [
    "SINGLE_USER",
    "LEGACY_SINGLE_USER_PASSTHROUGH",
    "LEGACY_SINGLE_USER_STANDARD",
    "LEGACY_SINGLE_USER",
];

export function isSingleUser(cluster: ClusterDetails): boolean {
    return cluster.accessMode !== undefined && SINGLE_USER_MODES.includes(cluster.accessMode);
}

/** `RUNNING` first, then by how soon it may run, then by name (the old `sortClusters`). */
const STATE_WEIGHT: Readonly<Record<string, number>> = {
    RUNNING: 10,
    PENDING: 9,
    RESTARTING: 8,
    RESIZING: 7,
    TERMINATING: 6,
    TERMINATED: 5,
    ERROR: 4,
    UNKNOWN: 3,
};

export function sortClusters(clusters: readonly ClusterDetails[]): ClusterDetails[] {
    const weight = (c: ClusterDetails) => STATE_WEIGHT[c.state] ?? 0;
    return [...clusters].sort(
        (a, b) => weight(b) - weight(a) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    );
}

/** The cluster's configuration page, as the old `Cluster.url`. */
export function clusterUrl(host: string, clusterId: string): string {
    return `${host.replace(/\/+$/, "")}/#setting/clusters/${clusterId}/configuration`;
}

/** A single-user cluster assigned to `userName` (the old `Cluster.isValidSingleUser`). */
export function isSingleUserOf(cluster: ClusterDetails, userName: string): boolean {
    return isSingleUser(cluster) && cluster.singleUserName === userName;
}

function formatClusterSize(sizeInMB: number): string {
    if (sizeInMB > 1024) {
        return Math.round(sizeInMB / 1024).toString() + " GB";
    }
    return `${sizeInMB} MB`;
}

/**
 * Formats a compute state for display: RUNNING and TERMINATED read
 * "Active" and "Inactive", as in the workspace UI; other states are
 * title-cased ("PENDING" → "Pending").
 */
export function formatClusterState(state: string): string {
    switch (state) {
        case "RUNNING":
            return "Active";
        case "TERMINATED":
            return "Inactive";
        default:
            return state.charAt(0) + state.slice(1).toLowerCase();
    }
}

/** The picker item's detail: `2 GB | 4 Cores | <runtime> | <creator>`. */
export function formatQuickPickClusterDetails(cluster: ClusterDetails): string {
    const details: string[] = [];
    if (cluster.memoryMb) {
        details.push(formatClusterSize(cluster.memoryMb));
    }
    if (cluster.cores) {
        details.push(`${cluster.cores} Cores`);
    }
    details.push(cluster.sparkVersion ?? "");
    details.push(cluster.creator ?? "");
    return details.join(" | ");
}
