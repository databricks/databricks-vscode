import {TreeItemCollapsibleState} from "vscode";
import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";
import {BundleResourceExplorerTreeItem, Renderer, TreeNode} from "./types";
import {BundleRunManager} from "../../bundle/BundleRunManager";

export class PipelineRenderer implements Renderer {
    readonly type = "pipelines";

    constructor(private readonly bundleRunManager: BundleRunManager) {}

    getTreeItem(element: TreeNode): BundleResourceExplorerTreeItem {
        if (element.type !== this.type) {
            throw new Error("Invalid element type");
        }

        return {
            label: element.data.name,
            contextValue: `databricks.bundle.resource-explorer.${
                this.bundleRunManager.isRunning(element.resourceKey)
                    ? "running"
                    : "runnable"
            }.pipeline`,
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
    }

    getChildren(element: TreeNode): TreeNode[] {
        if (element.type !== this.type) {
            return [];
        }

        const children: TreeNode[] = [];
        if (element.data.catalog) {
            children.push({
                type: "treeItem",
                parent: element,
                treeItem: {
                    label: "Catalog",
                    description: element.data.catalog,
                    contextValue: "catalog",
                },
            });
        }

        if (element.data.target) {
            children.push({
                type: "treeItem",
                parent: element,
                treeItem: {
                    label: "Target",
                    description: element.data.target,
                    contextValue: "target",
                },
            });
        }

        return children;
    }

    getRoots(remoteStateConfig: BundleRemoteState): TreeNode[] {
        const pipelines = remoteStateConfig?.resources?.pipelines;
        if (pipelines === undefined) {
            return [];
        }

        return Object.keys(pipelines).map((pipelineKey) => {
            return {
                type: this.type,
                data: pipelines[pipelineKey],
                resourceKey: `pipelines.${pipelineKey}`,
            };
        });
    }
}
