import {
    Disposable,
    Event,
    EventEmitter,
    ThemeColor,
    ThemeIcon,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
} from "vscode";

import {ClusterListDataProvider} from "../cluster/ClusterListDataProvider";
import {CodeSynchronizer} from "../sync/CodeSynchronizer";
import {ConnectionManager} from "./ConnectionManager";
import {WorkspaceStateManager} from "../vscode-objs/WorkspaceState";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {
    WorkspaceFsAccessVerifier,
    switchToWorkspacePrompt,
} from "../workspace-fs";
import {FeatureManager} from "../feature-manager/FeatureManager";
import {Telemetry} from "../telemetry";

export type ConfigurationTreeItem = TreeItem & {
    url?: string;
};

/**
 * Data provider for the cluster tree view
 */
export class ConfigurationDataProvider
    implements TreeDataProvider<ConfigurationTreeItem>, Disposable
{
    private _onDidChangeTreeData: EventEmitter<
        ConfigurationTreeItem | undefined | void
    > = new EventEmitter<ConfigurationTreeItem | undefined | void>();
    readonly onDidChangeTreeData: Event<
        ConfigurationTreeItem | undefined | void
    > = this._onDidChangeTreeData.event;

    private disposables: Array<Disposable> = [];

    constructor(
        private connectionManager: ConnectionManager,
        private sync: CodeSynchronizer,
        private readonly workspaceState: WorkspaceStateManager,
        private readonly wsfsAccessVerifier: WorkspaceFsAccessVerifier,
        private readonly featureManager: FeatureManager,
        private readonly telemetry: Telemetry
    ) {
        this.disposables.push(
            this.connectionManager.onDidChangeState(() => {
                this._onDidChangeTreeData.fire();
            }),
            this.connectionManager.onDidChangeCluster(() => {
                this._onDidChangeTreeData.fire();
            }),
            this.connectionManager.onDidChangeSyncDestination(() => {
                this._onDidChangeTreeData.fire();
            }),
            this.sync.onDidChangeState(() => {
                this._onDidChangeTreeData.fire();
            }),
            this.wsfsAccessVerifier.onDidChangeState(() => {
                this._onDidChangeTreeData.fire();
            })
        );

        this.connectionManager;
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }

    getTreeItem(element: ConfigurationTreeItem): TreeItem | Thenable<TreeItem> {
        return element;
    }

    async getChildren(
        element?: ConfigurationTreeItem | undefined
    ): Promise<Array<ConfigurationTreeItem>> {
        switch (this.connectionManager.state) {
            case "CONNECTED":
                break;
            case "CONNECTING":
                await this.connectionManager.waitForConnect();
                break;
            case "DISCONNECTED":
                return [];
        }

        const cluster = this.connectionManager.cluster;
        const syncDestination = this.connectionManager.syncDestinationMapper;

        if (!element) {
            const children: Array<ConfigurationTreeItem> = [];
            children.push({
                label: `Workspace`,
                iconPath: new ThemeIcon("account"),
                id: "WORKSPACE",
                collapsibleState: TreeItemCollapsibleState.Expanded,
                contextValue: "workspace",
                url: this.connectionManager.databricksWorkspace?.host?.toString(),
            });

            if (cluster) {
                let contextValue:
                    | "databricks.cluster.running"
                    | "databricks.cluster.pending"
                    | "databricks.cluster.terminating"
                    | "databricks.cluster.terminated" =
                    "databricks.cluster.terminated";

                switch (cluster.state) {
                    case "RESIZING":
                    case "RUNNING":
                        contextValue = "databricks.cluster.running";
                        break;
                    case "PENDING":
                    case "RESTARTING":
                        contextValue = "databricks.cluster.pending";
                        break;
                    case "TERMINATING":
                        contextValue = "databricks.cluster.terminating";
                        break;
                    case "TERMINATED":
                        contextValue = "databricks.cluster.terminated";
                        break;
                }

                children.push({
                    label: "Cluster",
                    iconPath: new ThemeIcon("server"),
                    id: "CLUSTER",
                    collapsibleState: TreeItemCollapsibleState.Expanded,
                    contextValue,
                    url: (await cluster.url).toString(),
                });
            } else {
                children.push({
                    label: `Cluster - "None attached"`,
                    iconPath: new ThemeIcon("server"),
                    id: "CLUSTER",
                    collapsibleState: TreeItemCollapsibleState.Expanded,
                    contextValue: "clusterDetached",
                });
            }
            if (syncDestination) {
                const url = this.connectionManager.workspaceClient
                    ? await syncDestination.remoteUri.getUrl(
                          this.connectionManager.workspaceClient
                      )
                    : undefined;
                // TODO: Add another icon over here for in_progress state
                // DECO-220
                children.push({
                    label: `Sync Destination`,
                    iconPath: new ThemeIcon("file-directory"),
                    id: "SYNC-DESTINATION",
                    collapsibleState: TreeItemCollapsibleState.Expanded,
                    url: url,
                    contextValue:
                        this.sync.state === "WATCHING_FOR_CHANGES" ||
                        this.sync.state === "IN_PROGRESS"
                            ? "syncRunning"
                            : "syncStopped",
                });
            } else {
                children.push({
                    label: `Sync Destination - "None attached"`,
                    iconPath: new ThemeIcon("file-directory"),
                    id: "SYNC-DESTINATION",
                    collapsibleState: TreeItemCollapsibleState.Expanded,
                    contextValue: "syncDetached",
                });
            }

            return children;
        }

        const dbWorkspace = this.connectionManager.databricksWorkspace;
        if (element.id === "WORKSPACE" && dbWorkspace) {
            return [
                {
                    label: "Auth",
                    description: dbWorkspace.authProvider.describe(),
                    collapsibleState: TreeItemCollapsibleState.None,
                },
                {
                    label: "User",
                    description: dbWorkspace.userName,
                    collapsibleState: TreeItemCollapsibleState.None,
                },
                {
                    label: "Host",
                    description: dbWorkspace.host.toString(),
                    collapsibleState: TreeItemCollapsibleState.None,
                    contextValue: "databricks-link",
                },
            ];
        }

        if (element.id?.startsWith("CLUSTER") && cluster) {
            const clusterItem =
                ClusterListDataProvider.clusterNodeToTreeItem(cluster);

            const children: ConfigurationTreeItem[] = [
                {
                    label: "Name",
                    description: cluster.name,
                    iconPath: clusterItem.iconPath,
                    collapsibleState: TreeItemCollapsibleState.None,
                },
            ];

            let runPerms:
                | "CAN_RUN"
                | "MIGHT_RUN"
                | "UNABLE_TO_RUN"
                | "MIGHT_NOT_RUN" = "MIGHT_RUN";
            if (
                cluster.state === "RUNNING" &&
                cluster?.canExecuteCached !== undefined
            ) {
                runPerms = cluster.canExecuteCached
                    ? "CAN_RUN"
                    : "UNABLE_TO_RUN";
            } else {
                runPerms =
                    cluster.hasExecutePermsCached ?? true
                        ? "MIGHT_RUN"
                        : "MIGHT_NOT_RUN";
            }

            switch (runPerms) {
                case "CAN_RUN":
                    children.push({
                        label: "You can run code on this cluster",
                        iconPath: new ThemeIcon(
                            "testing-passed-icon",
                            new ThemeColor("testing.iconPassed")
                        ),
                    });
                    break;

                case "MIGHT_NOT_RUN":
                    children.push({
                        label: "You might not have permissions to run code on this cluster",
                        iconPath: new ThemeIcon(
                            "warning",
                            new ThemeColor("problemsWarningIcon.foreground")
                        ),
                    });
                    break;

                case "UNABLE_TO_RUN":
                    children.push({
                        label: "You do not have permissions to run code on this cluster",
                        iconPath: new ThemeIcon(
                            "alert",
                            new ThemeColor("testing.iconFailed")
                        ),
                    });
                    break;
            }

            children.push(
                ...(await ClusterListDataProvider.clusterNodeToTreeItems(
                    cluster
                ))
            );
            const dbconnectReason = await this.getDbConnectDisabledReason();
            if (dbconnectReason) {
                children.push(dbconnectReason);
            }
            return children;
        }

        if (element.id === "SYNC-DESTINATION" && syncDestination) {
            const children: Array<TreeItem> = [
                {
                    label: `Name`,
                    description: syncDestination.remoteUri.name,
                    iconPath:
                        this.sync.state === "WATCHING_FOR_CHANGES" ||
                        this.sync.state === "IN_PROGRESS"
                            ? new ThemeIcon("debug-start")
                            : new ThemeIcon("debug-stop"),
                    collapsibleState: TreeItemCollapsibleState.None,
                },
            ];

            if (
                workspaceConfigs.syncDestinationType === "repo" &&
                this.wsfsAccessVerifier.isEnabled
            ) {
                const label = "Switch to workspace";
                children.push({
                    label: {
                        highlights: [[0, label.length]],
                        label,
                    },
                    tooltip: "Click to switch to workspace",
                    iconPath: new ThemeIcon(
                        "warning",
                        new ThemeColor("problemsWarningIcon.foreground")
                    ),
                    command: {
                        title: "Call",
                        command: "databricks.call",
                        arguments: [
                            () => {
                                switchToWorkspacePrompt(
                                    this.workspaceState,
                                    this.telemetry
                                );
                            },
                        ],
                    },
                });
            }
            children.push(
                {
                    label: `State`,
                    description: this.sync.state,
                    collapsibleState: TreeItemCollapsibleState.None,
                },
                {
                    label: `Path`,
                    description: syncDestination.remoteUri.path,
                    collapsibleState: TreeItemCollapsibleState.None,
                }
            );
            return children;
        }

        return [];
    }

    async getDbConnectDisabledReason(): Promise<
        ConfigurationTreeItem | undefined
    > {
        const isDbConnectEnabled = await this.featureManager.isEnabled(
            "debugging.dbconnect"
        );
        if (isDbConnectEnabled.isDisabledByFf || isDbConnectEnabled.avaliable) {
            return undefined;
        }

        return isDbConnectEnabled.reason &&
            isDbConnectEnabled.reason.toLowerCase().includes("cluster")
            ? {
                  label: "Debug",
                  description: isDbConnectEnabled.reason,
              }
            : undefined;
    }
}
