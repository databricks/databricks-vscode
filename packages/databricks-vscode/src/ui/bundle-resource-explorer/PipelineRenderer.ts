import {ExtensionContext, TreeItemCollapsibleState} from "vscode";
import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";
import {BundleResourceExplorerTreeItem, Renderer, TreeNode} from "./types";
import path from "path";

export class PipelineRenderer implements Renderer {
    readonly type = "pipelines";

    constructor(private readonly context: ExtensionContext) {}

    async getTreeItem(
        element: TreeNode
    ): Promise<BundleResourceExplorerTreeItem> {
        if (element.type !== this.type) {
            throw new Error("Invalid element type");
        }

        return {
            label: element.data.name,
            iconPath: {
                dark: this.context.asAbsolutePath(
                    path.join(
                        "resources",
                        "dark",
                        "resource-explorer",
                        `${this.type}.svg`
                    )
                ),
                light: this.context.asAbsolutePath(
                    path.join(
                        "resources",
                        "light",
                        "resource-explorer",
                        `${this.type}.svg`
                    )
                ),
            },
            contextValue: this.type,
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
    }

    async getChildren(element: TreeNode): Promise<TreeNode[]> {
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

    async getRoots(remoteStateConfig: BundleRemoteState): Promise<TreeNode[]> {
        const pipelines = remoteStateConfig?.resources?.pipelines;
        if (pipelines === undefined) {
            return [];
        }

        return Object.keys(pipelines).map((pipelineKey) => {
            return {
                type: this.type,
                data: pipelines[pipelineKey],
                resourceKey: pipelineKey,
            };
        });
    }
}
