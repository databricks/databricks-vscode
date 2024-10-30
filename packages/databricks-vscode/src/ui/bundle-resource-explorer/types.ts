import {TreeItem} from "vscode";
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
        | "resource_type_header"
        | "task"
        | "job_run_status"
        | "task_header";
    parent?: BundleResourceExplorerTreeNode;
    getTreeItem(): BundleResourceExplorerTreeItem;
    getChildren(): BundleResourceExplorerTreeNode[];
}
