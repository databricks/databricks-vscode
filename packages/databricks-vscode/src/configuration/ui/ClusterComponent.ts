import {ConfigModel} from "../ConfigModel";
import {ConnectionManager} from "../ConnectionManager";
import {BaseComponent} from "./BaseComponent";
import {
    TreeItem,
    TreeItemCollapsibleState,
    ThemeIcon,
    ThemeColor,
} from "vscode";
import {ConfigurationTreeItem} from "./types";
import {Cluster} from "../../sdk-extensions";
import {onError} from "../../utils/onErrorDecorator";
import {Loggers} from "../../logger";

const TREE_ICON_ID = "CLUSTER";

function getTreeItemsForClusterState(cluster: Cluster) {
    let icon, contextValue;
    switch (cluster.state) {
        case "RESIZING":
        case "RUNNING":
            icon = new ThemeIcon("debug-start");
            contextValue = "databricks.configuration.cluster.running";
            break;

        case "RESTARTING":
        case "PENDING":
            icon = new ThemeIcon(
                "sync~spin",
                new ThemeColor("debugIcon.startForeground")
            );
            contextValue = "databricks.configuration.cluster.pending";
            break;

        case "TERMINATING":
            icon = new ThemeIcon(
                "sync~spin",
                new ThemeColor("notificationsErrorIcon.foreground")
            );
            contextValue = "databricks.configuration.cluster.terminating";
            break;

        case "TERMINATED":
            icon = new ThemeIcon(
                "stop-circle",
                new ThemeColor("notificationsErrorIcon.foreground")
            );
            contextValue = "databricks.configuration.cluster.terminated";
            break;

        case "ERROR":
            icon = new ThemeIcon(
                "testing-error-icon",
                new ThemeColor("notificationsErrorIcon.foreground")
            );
            contextValue = "databricks.configuration.cluster.error";
            break;

        default:
            icon = new ThemeIcon("question");
            contextValue = "databricks.configuration.cluster.unknown";
            break;
    }

    return {icon, contextValue};
}

export class ClusterComponent extends BaseComponent {
    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly configModel: ConfigModel
    ) {
        super();
        this.disposables.push(
            this.connectionManager.onDidChangeCluster(() => {
                this.onDidChangeEmitter.fire();
            }),
            this.connectionManager.onDidChangeState(() => {
                this.onDidChangeEmitter.fire();
            })
        );
    }

    @onError({log: {logger: Loggers.Extension}, popup: true})
    private async getRoot(): Promise<ConfigurationTreeItem[]> {
        const config = await this.configModel.getS("clusterId");

        if (config?.config === undefined) {
            // Cluster is not set in bundle and override
            // We are not logged in
            if (this.connectionManager.state !== "CONNECTED") {
                return [];
            }

            // Cluster is not set in bundle and override
            // We are logged in
            const label = "Select a cluster";
            return [
                {
                    label: {
                        label,
                        highlights: [[0, label.length]],
                    },
                    collapsibleState: TreeItemCollapsibleState.Expanded,
                    contextValue: "databricks.configuration.cluster.none",
                    iconPath: new ThemeIcon(
                        "server",
                        new ThemeColor("notificationsErrorIcon.foreground")
                    ),
                    id: TREE_ICON_ID,
                },
            ];
        }

        const {config: clusterId, source} = config;

        // Cluster is set in bundle / override
        // We are not logged in
        if (this.connectionManager.state !== "CONNECTED") {
            return [
                {
                    label: "Cluster",
                    description: clusterId,
                    collapsibleState: TreeItemCollapsibleState.Expanded,
                    contextValue: "databricks.configuration.cluster.selected",
                    iconPath: new ThemeIcon(
                        "server",
                        new ThemeColor("notificationsErrorIcon.foreground")
                    ),
                    source: source,
                    id: TREE_ICON_ID,
                },
            ];
        }

        // Cluster is set in bundle / override
        // We are logged in
        const cluster = this.connectionManager.cluster;
        if (cluster === undefined) {
            // can never happen. Just need it for typescript type coercing.
            return [];
        }
        const {icon, contextValue} = getTreeItemsForClusterState(cluster);

        return [
            {
                label: "Cluster",
                description: cluster.name,
                collapsibleState: TreeItemCollapsibleState.Expanded,
                contextValue: contextValue,
                iconPath: icon,
                source: source,
                id: TREE_ICON_ID,
            },
        ];
    }

    public async getChildren(
        parent?: TreeItem
    ): Promise<ConfigurationTreeItem[]> {
        if (parent === undefined) {
            return this.getRoot();
        }

        if (parent.id !== TREE_ICON_ID) {
            return [];
        }

        if (
            this.connectionManager.state !== "CONNECTED" ||
            this.connectionManager.cluster === undefined
        ) {
            return [];
        }

        const cluster = this.connectionManager.cluster;
        const children: TreeItem[] = [
            {
                label: "Cluster ID",
                description: cluster.id,
            },
        ];

        children.push(
            {
                label: "Databricks Runtime",
                description: cluster.dbrVersion.join("."),
            },
            {
                label: "Creator",
                description: cluster.details.creator_user_name,
            }
        );

        if (cluster.stateMessage && cluster.state !== "RUNNING") {
            children.push({
                label: "State",
                description: `${cluster.state} - ${cluster.stateMessage}`,
            });
        }

        if (cluster.accessMode) {
            const description = cluster.isSingleUser()
                ? `${cluster.accessMode} - ${cluster.details.single_user_name}`
                : `${cluster.accessMode}`;
            children.push({
                label: "Access Mode",
                description: description,
            });
        }

        return children;
    }
}
