import {Location, TreeItem} from "vscode";
import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";
import {Resource, ResourceKey} from "../../bundle/types";

export type BundleResourceExplorerResourceKey = ResourceKey<BundleRemoteState>;
export type BundleResourceExplorerResource<
    K extends BundleResourceExplorerResourceKey,
> = Resource<BundleRemoteState, K>;

export interface BundleResourceExplorerTreeItem extends TreeItem {}

export interface BundleResourceExplorerTreeNode {
    type:
        | BundleResourceExplorerResourceKey
        | "treeItem"
        | "task_run_status"
        | "pipeline_run_status"
        | "pipeline_run_events"
        | "pipeline_run_event"
        | "pipeline_datasets"
        | "pipeline_dataset"
        | "resource_type_header"
        | "unknown_resource"
        | "task"
        | "job_run_status"
        | "task_header";
    parent?: BundleResourceExplorerTreeNode;
    url?: string;
    sourceLocation?: Location;
    getTreeItem(): BundleResourceExplorerTreeItem;
    getChildren():
        | BundleResourceExplorerTreeNode[]
        | Promise<BundleResourceExplorerTreeNode[]>;
}

export const KNOWN_RESOURCE_TYPES: BundleResourceExplorerTreeNode["type"][] = [
    "jobs",
    "pipelines",
];
export const KNOWN_ICON_RESOURCE_TYPES: BundleResourceExplorerTreeNode["type"][] =
    [
        ...KNOWN_RESOURCE_TYPES,
        "apps" as any, // TODO: Remove 'as any' after CLI officially supports apps
        "clusters",
        "dashboards",
        "experiments",
        "model_serving_endpoints",
        "models",
        "quality_monitors",
        "registered_models",
        "schemas",
        "volumes",
    ];
