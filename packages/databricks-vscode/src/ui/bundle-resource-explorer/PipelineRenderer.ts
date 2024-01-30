import {TreeItemCollapsibleState} from "vscode";
import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";
import {BundleResourceExplorerTreeItem, Renderer, TreeNode} from "./types";
import {BundleRunStatusManager} from "../../bundle/run/BundleRunStatusManager";
import {GetUpdateResponse} from "@databricks/databricks-sdk/dist/apis/pipelines";

export class PipelineRenderer implements Renderer {
    readonly type = "pipelines";

    constructor(
        private readonly bundleRunStatusManager: BundleRunStatusManager
    ) {}

    isRunning(resourceKey: string) {
        const runner = this.bundleRunStatusManager.runStatuses.get(resourceKey);
        return runner?.runState === "running";
    }

    getTreeItem(element: TreeNode): BundleResourceExplorerTreeItem {
        if (element.type !== this.type) {
            throw new Error("Invalid element type");
        }

        const isRunning = this.isRunning(element.resourceKey);

        return {
            label: element.data.name,
            contextValue: `databricks.bundle.resource-explorer.${
                isRunning ? "running" : "runnable"
            }.pipeline`,
            collapsibleState: isRunning
                ? TreeItemCollapsibleState.Expanded
                : TreeItemCollapsibleState.Collapsed,
        };
    }

    getChildren(element: TreeNode): TreeNode[] {
        if (element.type !== this.type) {
            return [];
        }

        const children: TreeNode[] = [];
        const runMonitor = this.bundleRunStatusManager.runStatuses.get(
            element.resourceKey
        );
        const update = runMonitor?.data as GetUpdateResponse | undefined;
        if (update?.update?.update_id !== undefined) {
            children.push({
                type: "pipeline_run_status",
                parent: element,
                pipelineId: update.update.pipeline_id,
                updateId: update.update.update_id,
                pipelineResourceKey: element.resourceKey,
                update: update,
            });
        }

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
