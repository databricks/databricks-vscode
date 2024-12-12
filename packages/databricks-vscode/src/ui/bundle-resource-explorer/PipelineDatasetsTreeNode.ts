import {
    BundleResourceExplorerTreeItem,
    BundleResourceExplorerTreeNode,
} from "./types";
import {ThemeIcon, TreeItemCollapsibleState} from "vscode";
import {ContextUtils} from "./utils";
import {TreeItemTreeNode} from "../TreeItemTreeNode";
import {
    BundlePipelinesManager,
    DatasetWithSchema,
    isFullGraphUpdate,
} from "../../bundle/BundlePipelinesManager";
import {PipelineRunStatus} from "../../bundle/run/PipelineRunStatus";
import {
    getSimplifiedPipelineUpdateState,
    isInLoadingState,
} from "./utils/RunStateUtils";

class PipelineDatasetTreeNode implements BundleResourceExplorerTreeNode {
    readonly type = "pipeline_dataset";
    constructor(private readonly datasetWithSchema: DatasetWithSchema) {}

    getChildren(): BundleResourceExplorerTreeNode[] {
        const children: BundleResourceExplorerTreeNode[] = [];
        for (const field of this.datasetWithSchema.schema) {
            children.push(
                new TreeItemTreeNode(
                    {
                        label: field.name,
                        description: toDescription(field.type),
                        contextValue: "dataset_field",
                    },
                    this
                )
            );
        }
        return children;
    }

    getTreeItem(): BundleResourceExplorerTreeItem {
        return {
            label: this.datasetWithSchema.name,
            description: toDescription(this.datasetWithSchema.type),
            contextValue: ContextUtils.getContextString({
                nodeType: this.type,
            }),
            collapsibleState:
                this.datasetWithSchema.schema.length >= 0
                    ? TreeItemCollapsibleState.Collapsed
                    : TreeItemCollapsibleState.None,
        };
    }
}

export class PipelineDatasetsTreeNode
    implements BundleResourceExplorerTreeNode
{
    readonly type = "pipeline_datasets";

    constructor(
        private readonly pipelineKey: string,
        private readonly pipelinesManager: BundlePipelinesManager,
        private readonly runMonitor?: PipelineRunStatus,
        public parent?: BundleResourceExplorerTreeNode
    ) {}

    async getChildren(): Promise<BundleResourceExplorerTreeNode[]> {
        const schemas = this.pipelinesManager.getSchemas(this.pipelineKey);

        // Preload and merge schemas from the past runs if the current run is not a full graph update (or doesn't exist)
        // Note that getChildren can be called frequently, but we only preload the schemas once, and later on just return cached results.
        if (!isFullGraphUpdate(this.runMonitor?.data)) {
            const preloadedData = await this.pipelinesManager.preloadDatasets(
                this.pipelineKey.split(".")[1]
            );
            const preloadedSchemas = preloadedData?.schemas ?? new Map();
            for (const [key, value] of preloadedSchemas) {
                if (!schemas.has(key)) {
                    schemas.set(key, value);
                }
            }
        }

        if (schemas.size === 0) {
            const status = getSimplifiedPipelineUpdateState(
                this.runMonitor?.data
            );
            if (isInLoadingState(this.runMonitor, status)) {
                return [new TreeItemTreeNode({label: "Loading..."}, this)];
            } else {
                return [
                    new TreeItemTreeNode(
                        {label: "Run or validate the pipeline to see datasets"},
                        this
                    ),
                ];
            }
        }

        const children: BundleResourceExplorerTreeNode[] = [];
        for (const [, datasetWithSchema] of schemas) {
            children.push(new PipelineDatasetTreeNode(datasetWithSchema));
        }
        return children;
    }

    getTreeItem(): BundleResourceExplorerTreeItem {
        const status = getSimplifiedPipelineUpdateState(this.runMonitor?.data);
        return {
            label: "Datasets",
            iconPath: isInLoadingState(this.runMonitor, status)
                ? new ThemeIcon("loading~spin")
                : new ThemeIcon("database"),
            contextValue: ContextUtils.getContextString({
                nodeType: this.type,
            }),
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
    }
}

function toDescription(str: string) {
    return str.toLowerCase().replace(/_/g, " ");
}
