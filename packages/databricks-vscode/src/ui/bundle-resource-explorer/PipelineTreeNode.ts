import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";
import {
    BundleResourceExplorerResource,
    BundleResourceExplorerTreeItem,
    BundleResourceExplorerTreeNode,
} from "./types";
import {BundleRunStatusManager} from "../../bundle/run/BundleRunStatusManager";
import {ContextUtils} from "./utils";
import {DecorationUtils} from "../utils";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {PipelineRunStatus} from "../../bundle/run/PipelineRunStatus";
import {TreeItemTreeNode} from "../TreeItemTreeNode";
import {PipelineRunStatusTreeNode} from "./PipelineRunStatusTreeNode";
import {ThemeIcon, Location} from "vscode";
import {PipelineDatasetsTreeNode} from "./PipelineDatasetsTreeNode";
import {BundlePipelinesManager} from "../../bundle/BundlePipelinesManager";
import {getSourceLocation} from "./utils/SourceLocationUtils";

export class PipelineTreeNode implements BundleResourceExplorerTreeNode {
    readonly type = "pipelines";
    get url(): string | undefined {
        const host = this.connectionManager.databricksWorkspace?.host;

        if (!host || !this.data.id) {
            return undefined;
        }

        return `${host.toString()}#joblist/pipelines/${this.data.id}`;
    }

    get sourceLocation(): Location | undefined {
        return getSourceLocation(
            this.locations,
            this.connectionManager.projectRoot,
            this.resourceKey
        );
    }

    constructor(
        private readonly connectionManager: ConnectionManager,
        private readonly bundleRunStatusManager: BundleRunStatusManager,
        private readonly pipelinesManager: BundlePipelinesManager,
        public readonly resourceKey: string,
        public readonly data: BundleResourceExplorerResource<"pipelines">,
        private readonly locations: BundleRemoteState["__locations"],
        public parent?: BundleResourceExplorerTreeNode
    ) {}

    isRunning(resourceKey: string) {
        const runner = this.bundleRunStatusManager.runStatuses.get(resourceKey);
        return runner?.runState === "running" || runner?.runState === "unknown";
    }

    getTreeItem(): BundleResourceExplorerTreeItem {
        const isRunning = this.isRunning(this.resourceKey);

        return {
            label: this.data.name,
            contextValue: ContextUtils.getContextString({
                resourceType: this.type,
                running: isRunning,
                hasUrl: this.url !== undefined,
                hasSourceLocation: this.sourceLocation !== undefined,
                cancellable: isRunning,
                nodeType: this.type,
                modifiedStatus: this.data.modified_status,
            }),
            resourceUri: DecorationUtils.getModifiedStatusDecoration(
                this.data.name ?? this.resourceKey,
                this.data.modified_status
            ),
            collapsibleState: DecorationUtils.getCollapsibleState(
                isRunning,
                this.data.modified_status
            ),
        };
    }

    getChildren(): BundleResourceExplorerTreeNode[] {
        const children: BundleResourceExplorerTreeNode[] = [];
        const runMonitor = this.bundleRunStatusManager.runStatuses.get(
            this.resourceKey
        ) as PipelineRunStatus | undefined;
        if (this.data.catalog) {
            children.push(
                new TreeItemTreeNode(
                    {
                        label: "Catalog",
                        description: this.data.catalog,
                        iconPath: new ThemeIcon("book"),
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
                        iconPath: new ThemeIcon("target"),
                        contextValue: "target",
                    },
                    this
                )
            );
        }

        children.push(
            new PipelineDatasetsTreeNode(
                this.resourceKey,
                this.pipelinesManager,
                runMonitor,
                this
            )
        );

        if (runMonitor) {
            children.push(
                new PipelineRunStatusTreeNode(
                    this.connectionManager,
                    runMonitor,
                    this
                )
            );
        }

        return children;
    }

    static getRoots(
        connectionManager: ConnectionManager,
        bundleRunStatusManager: BundleRunStatusManager,
        pipelinesManager: BundlePipelinesManager,
        remoteStateConfig: BundleRemoteState
    ): BundleResourceExplorerTreeNode[] {
        const pipelines = remoteStateConfig?.resources?.pipelines;
        if (pipelines === undefined) {
            return [];
        }

        return Object.keys(pipelines).map((pipelineKey) => {
            return new PipelineTreeNode(
                connectionManager,
                bundleRunStatusManager,
                pipelinesManager,
                `pipelines.${pipelineKey}`,
                pipelines[pipelineKey],
                remoteStateConfig.__locations,
                undefined
            );
        });
    }
}
