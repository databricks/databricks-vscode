import {TreeItemCollapsibleState} from "vscode";
import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";
import {
    BundleResourceExplorerResource,
    BundleResourceExplorerTreeItem,
    BundleResourceExplorerTreeNode,
} from "./types";
import {BundleRunStatusManager} from "../../bundle/run/BundleRunStatusManager";
import {ContextUtils, DecorationUtils} from "./utils";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {PipelineRunStatus} from "../../bundle/run/PipelineRunStatus";
import {TreeItemTreeNode} from "./TreeItemTreeNode";
import {PipelineRunStatusTreeNode} from "./PipelineRunStatusTreeNode";

export class PipelineTreeNode implements BundleResourceExplorerTreeNode {
    readonly type = "pipelines";
    get url(): string | undefined {
        const host = this.connectionManager.databricksWorkspace?.host;

        if (!host || !this.data.id) {
            return undefined;
        }

        return `${host.toString()}#joblist/pipelines/${this.data.id}`;
    }

    constructor(
        private readonly bundleRunStatusManager: BundleRunStatusManager,
        private readonly connectionManager: ConnectionManager,
        public readonly resourceKey: string,
        public readonly data: BundleResourceExplorerResource<"pipelines">,
        public parent?: BundleResourceExplorerTreeNode
    ) {}

    isRunning(resourceKey: string) {
        const runner = this.bundleRunStatusManager.runStatuses.get(resourceKey);
        return runner?.runState === "running";
    }

    getTreeItem(): BundleResourceExplorerTreeItem {
        const isRunning = this.isRunning(this.resourceKey);

        return {
            label: this.data.name,
            contextValue: ContextUtils.getContextString({
                resourceType: this.type,
                running: isRunning,
                hasUrl: this.url !== undefined,
                nodeType: this.type,
            }),
            resourceUri: DecorationUtils.getModifiedStatusDecoration(
                this.resourceKey,
                this.data.modified_status
            ),
            collapsibleState: isRunning
                ? TreeItemCollapsibleState.Expanded
                : TreeItemCollapsibleState.Collapsed,
        };
    }

    getChildren(): BundleResourceExplorerTreeNode[] {
        const children: BundleResourceExplorerTreeNode[] = [];
        const runMonitor = this.bundleRunStatusManager.runStatuses.get(
            this.resourceKey
        ) as PipelineRunStatus | undefined;
        if (runMonitor?.data?.update?.update_id !== undefined) {
            children.push(
                new PipelineRunStatusTreeNode(
                    this.connectionManager,
                    runMonitor,
                    this
                )
            );
        }

        if (this.data.catalog) {
            children.push(
                new TreeItemTreeNode(
                    {
                        label: "Catalog",
                        description: this.data.catalog,
                        contextValue: "catalog",
                    },
                    this
                )
            );
        }

        if (this.data.target) {
            children.push(
                new TreeItemTreeNode(
                    {
                        label: "Target",
                        description: this.data.target,
                        contextValue: "target",
                    },
                    this
                )
            );
        }

        return children;
    }

    static getRoots(
        bundleRunStatusManager: BundleRunStatusManager,
        connectionManager: ConnectionManager,
        remoteStateConfig: BundleRemoteState
    ): BundleResourceExplorerTreeNode[] {
        const pipelines = remoteStateConfig?.resources?.pipelines;
        if (pipelines === undefined) {
            return [];
        }

        return Object.keys(pipelines).map((pipelineKey) => {
            return new PipelineTreeNode(
                bundleRunStatusManager,
                connectionManager,
                `pipelines.${pipelineKey}`,
                pipelines[pipelineKey],
                undefined
            );
        });
    }
}
