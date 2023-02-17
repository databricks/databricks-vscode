import {
    ThemeColor,
    ThemeIcon,
    TreeItem,
    TreeItemCollapsibleState,
} from "vscode";
import {Cluster} from "@databricks/databricks-sdk";

export function clusterNodeToTreeItem(element: Cluster): TreeItem {
    let icon: ThemeIcon;
    switch (element.state) {
        case "RUNNING":
            icon = new ThemeIcon("debug-start");
            break;

        case "RESTARTING":
        case "PENDING":
        case "RESIZING":
            icon = new ThemeIcon("debug-restart");
            break;

        case "TERMINATING":
            icon = new ThemeIcon(
                "stop-circle",
                new ThemeColor("notificationsErrorIcon.foreground")
            );
            break;

        case "TERMINATED":
        case "ERROR":
        case "UNKNOWN":
            icon = new ThemeIcon("debug-stop");
            break;
    }

    return {
        label: element.name,
        iconPath: icon,
        id: element.id,
        contextValue: "cluster",
        collapsibleState: TreeItemCollapsibleState.Collapsed,
    };
}

/**
 * Creates a list of TreeItems from a list of clusters. The information
 * in the TreeItems match the information presented in cluster list
 * of the Databricks webapp.
 */
export async function clusterNodeToTreeItems(
    element: Cluster
): Promise<Array<TreeItem>> {
    const children: TreeItem[] = [
        {
            label: "Cluster ID",
            description: element.id,
        },
    ];

    children.push({
        label: "Driver",
        description: element.details.driver_node_type_id,
    });

    if (element.details.autoscale) {
        children.push({
            label: "Worker",
            description: `${element.details.node_type_id}, ${element.details.autoscale.min_workers}-${element.details.autoscale.max_workers} workers`,
        });
    } else if (element.details.num_workers || 0 > 0) {
        children.push({
            label: "Worker",
            description: `${element.details.node_type_id}, ${element.details.num_workers} workers`,
        });
    } else {
        children.push({
            label: "Worker",
            description: `None (single node cluster)`,
        });
    }

    let stateDescription: string = element.state;
    if (element.stateMessage && element.state !== "RUNNING") {
        stateDescription = `${element.state} - ${element.stateMessage}`;
    }

    children.push(
        {
            label: "Databricks Runtime",
            description: element.dbrVersion.join("."),
        },
        {
            label: "State",
            description: stateDescription,
        },
        {
            label: "Creator",
            description: element.creator,
        }
    );

    return children;
}
