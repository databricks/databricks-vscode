import { ThemeColor, ThemeIcon, TreeItemCollapsibleState, type TreeItem } from "vscode";
import { dbrVersion, type ClusterDetails } from "../../kernel/compute/clusters";

/*
 * How a cluster reads in the Compute view and the picker. Ported from the
 * old `ClusterListDataProvider` and `ConnectionCommands`, with the same
 * icons, labels and details.
 */

/** The Compute view's and the picker's icon for a state. */
export function clusterStateIcon(state: string): ThemeIcon {
    switch (state) {
        case "RESIZING":
        case "RUNNING":
            return new ThemeIcon("debug-start");
        case "RESTARTING":
        case "PENDING":
            return new ThemeIcon("debug-restart");
        case "TERMINATING":
            return new ThemeIcon(
                "stop-circle",
                new ThemeColor("notificationsErrorIcon.foreground"),
            );
        default:
            return new ThemeIcon("debug-stop");
    }
}

/**
 * The Compute view's row. `contextValue` is `cluster.<state>`, lower case:
 * the menus attach any cluster, start a terminated one and stop a running or
 * pending one. The old row was `cluster` alone, and offered only Attach.
 */
export function clusterTreeItem(cluster: ClusterDetails): TreeItem {
    return {
        label: cluster.name,
        iconPath: clusterStateIcon(cluster.state),
        id: cluster.id,
        contextValue: `cluster.${cluster.state.toLowerCase()}`,
        collapsibleState: TreeItemCollapsibleState.Collapsed,
    };
}

/** The rows below a cluster, as the workspace's cluster list shows them. */
export function clusterDetailItems(cluster: ClusterDetails): TreeItem[] {
    const items: TreeItem[] = [
        { label: "Cluster ID", description: cluster.id },
        { label: "Driver", description: cluster.driverNodeTypeId },
    ];
    const workers = cluster.workers;
    if (workers?.kind === "autoscale") {
        items.push({
            label: "Worker",
            description: `${cluster.nodeTypeId}, ${workers.min}-${workers.max} workers`,
        });
    } else if (workers?.kind === "fixed" && workers.count > 0) {
        items.push({
            label: "Worker",
            description: `${cluster.nodeTypeId}, ${workers.count} workers`,
        });
    } else {
        items.push({ label: "Worker", description: "None (single node cluster)" });
    }
    items.push(
        { label: "Databricks Runtime", description: dbrVersion(cluster.sparkVersion).join(".") },
        { label: "State", description: stateDescription(cluster) },
        { label: "Creator", description: cluster.creator ?? "" },
    );
    return items;
}

/** `TERMINATED - Inactive for 120 minutes`; a running cluster's message isn't shown. */
function stateDescription(cluster: ClusterDetails): string {
    return cluster.stateMessage && cluster.state !== "RUNNING"
        ? `${cluster.state} - ${cluster.stateMessage}`
        : cluster.state;
}
