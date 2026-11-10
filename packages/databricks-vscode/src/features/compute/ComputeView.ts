import type { TreeItem } from "vscode";
import { sortClusters, type ClusterDetails } from "../../kernel/compute/clusters";
import type { ClusterList } from "../../kernel/compute/ComputeService";
import type { Logger } from "../../platform/log";
import { NodeTreeDataProvider, TreeItemNode, type TreeNode } from "../../platform/ui/tree";
import { clusterDetailItems, clusterTreeItem } from "./clusterItems";

export const COMPUTE_VIEW = "clusterView";

/** The Compute view's filter (not persisted, as before). */
export type ClusterFilter = "ALL" | "ME" | "RUNNING";

/** A cluster in the Compute view; the row commands receive it. */
export class ClusterNode implements TreeNode {
    readonly type = "cluster";

    constructor(
        readonly cluster: ClusterDetails,
        /** The cluster this session window runs on. */
        private readonly isSession = false,
    ) {}

    getTreeItem(): TreeItem {
        const item = clusterTreeItem(this.cluster);
        if (this.isSession) {
            item.description = "This session";
        }
        return item;
    }

    getChildren(): TreeNode[] {
        return clusterDetailItems(this.cluster).map((item) => new TreeItemNode(item, this));
    }
}

/** The cluster a row command was run on: a Compute view row, or a cluster ID. */
export function clusterIdOf(arg: unknown): string | undefined {
    if (arg instanceof ClusterNode) {
        return arg.cluster.id;
    }
    return typeof arg === "string" && arg !== "" ? arg : undefined;
}

export function applyFilter(
    clusters: readonly ClusterDetails[],
    filter: ClusterFilter,
    userName: string | undefined,
): ClusterDetails[] {
    switch (filter) {
        case "ALL":
            return [...clusters];
        case "ME":
            return clusters.filter((c) => c.creator === userName);
        case "RUNNING":
            return clusters.filter((c) => c.state === "RUNNING");
    }
}

/**
 * The COMPUTE view (COMP-07), behind the `views.cluster` experiment. Ported
 * from the old `ClusterListDataProvider` and `ClusterModel`: the clusters,
 * running ones first, with their details below each. It reads the list
 * `ComputeService` loads; the feature loads it while the view shows.
 */
export class ComputeTree {
    filter: ClusterFilter = "ALL";
    readonly provider: NodeTreeDataProvider<TreeNode>;

    constructor(
        clusters: () => ClusterList,
        userName: () => string | undefined,
        log: Logger,
        /** In a session window on a cluster, that cluster's ID. */
        sessionClusterId?: string,
    ) {
        this.provider = new NodeTreeDataProvider<TreeNode>(
            () =>
                sortClusters(applyFilter(clusters().clusters, this.filter, userName())).map(
                    (c) => new ClusterNode(c, c.id === sessionClusterId),
                ),
            log,
        );
    }

    setFilter(filter: ClusterFilter) {
        this.filter = filter;
        this.provider.refresh();
    }

    refresh() {
        this.provider.refresh();
    }

    dispose() {
        this.provider.dispose();
    }
}
