import path from "path";
import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";
import {BundleRunStatusManager} from "../../bundle/run/BundleRunStatusManager";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {JobTreeNode} from "./JobTreeNode";
import {
    BundleResourceExplorerTreeItem,
    BundleResourceExplorerTreeNode,
} from "./types";
import {ExtensionContext, TreeItemCollapsibleState} from "vscode";
import {PipelineTreeNode} from "./PipelineTreeNode";

function humaniseResourceType(type: BundleResourceExplorerTreeNode["type"]) {
    switch (type) {
        case "pipelines":
            return "Pipelines";
        case "jobs":
            return "Workflows";
        default:
            return type;
    }
}
export class ResourceTypeHeaderTreeNode
    implements BundleResourceExplorerTreeNode
{
    readonly type = "resource_type_header";
    constructor(
        private readonly context: ExtensionContext,
        private readonly resourceType: BundleResourceExplorerTreeNode["type"],
        public readonly children: BundleResourceExplorerTreeNode[],
        public parent?: BundleResourceExplorerTreeNode
    ) {
        this.children.forEach((child) => (child.parent = this));
    }

    private getIconPath(resourceType: string) {
        return {
            dark: this.context.asAbsolutePath(
                path.join(
                    "resources",
                    "dark",
                    "resource-explorer",
                    `${resourceType}.svg`
                )
            ),
            light: this.context.asAbsolutePath(
                path.join(
                    "resources",
                    "light",
                    "resource-explorer",
                    `${resourceType}.svg`
                )
            ),
        };
    }

    getTreeItem(): BundleResourceExplorerTreeItem {
        return {
            label: humaniseResourceType(this.resourceType),
            iconPath: this.getIconPath(this.resourceType),
            contextValue: `${this.resourceType}-header`,
            collapsibleState: TreeItemCollapsibleState.Expanded,
        };
    }

    getChildren(): BundleResourceExplorerTreeNode[] {
        return this.children;
    }

    static getRoots(
        context: ExtensionContext,
        bundleRunStatusManager: BundleRunStatusManager,
        connectionManager: ConnectionManager,
        bundleRemoteState: BundleRemoteState
    ) {
        const roots: BundleResourceExplorerTreeNode[] = [];

        const jobs = JobTreeNode.getRoots(
            context,
            bundleRunStatusManager,
            connectionManager,
            bundleRemoteState
        );
        if (jobs.length > 0) {
            roots.push(new ResourceTypeHeaderTreeNode(context, "jobs", jobs));
        }

        const pipelines = PipelineTreeNode.getRoots(
            bundleRunStatusManager,
            connectionManager,
            bundleRemoteState
        );
        if (pipelines.length > 0) {
            roots.push(
                new ResourceTypeHeaderTreeNode(context, "pipelines", pipelines)
            );
        }

        return roots;
    }
}
