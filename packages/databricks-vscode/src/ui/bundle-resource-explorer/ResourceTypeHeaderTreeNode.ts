import path from "path";
import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";
import {BundleRunStatusManager} from "../../bundle/run/BundleRunStatusManager";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {JobTreeNode} from "./JobTreeNode";
import {
    BundleResourceExplorerTreeItem,
    BundleResourceExplorerTreeNode,
    KNOWN_ICON_RESOURCE_TYPES,
    KNOWN_RESOURCE_TYPES,
} from "./types";
import {ExtensionContext, ThemeIcon, TreeItemCollapsibleState} from "vscode";
import {PipelineTreeNode} from "./PipelineTreeNode";
import {BundlePipelinesManager} from "../../bundle/BundlePipelinesManager";
import {UnknownResourceTreeNode} from "./UnknownResourceTreeNode";
import {capitalize} from "lodash";

function humaniseResourceType(type: BundleResourceExplorerTreeNode["type"]) {
    switch (type) {
        case "pipelines":
            return "Pipelines";
        case "jobs":
            return "Jobs";
        default:
            return capitalize(type).replace(/_/g, " ");
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

    private getIconPath(resourceType: BundleResourceExplorerTreeNode["type"]) {
        if (!KNOWN_ICON_RESOURCE_TYPES.includes(resourceType)) {
            return new ThemeIcon("folder");
        }

        return {
            dark: this.getThemedIconPath("dark", resourceType),
            light: this.getThemedIconPath("light", resourceType),
        };
    }

    private getThemedIconPath(theme: string, resourceType: string) {
        return this.context.asAbsolutePath(
            path.join(
                "resources",
                theme,
                "resource-explorer",
                `${resourceType}.svg`
            )
        );
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
        connectionManager: ConnectionManager,
        bundleRunStatusManager: BundleRunStatusManager,
        pipelinesManager: BundlePipelinesManager,
        bundleRemoteState: BundleRemoteState
    ) {
        const roots: BundleResourceExplorerTreeNode[] = [];

        for (const resourceType of KNOWN_RESOURCE_TYPES) {
            let resources: BundleResourceExplorerTreeNode[] = [];
            switch (resourceType) {
                case "jobs":
                    resources = JobTreeNode.getRoots(
                        context,
                        bundleRunStatusManager,
                        connectionManager,
                        bundleRemoteState
                    );
                    break;
                case "pipelines":
                    resources = PipelineTreeNode.getRoots(
                        connectionManager,
                        bundleRunStatusManager,
                        pipelinesManager,
                        bundleRemoteState
                    );
                    break;
            }
            if (resources.length > 0) {
                roots.push(
                    new ResourceTypeHeaderTreeNode(
                        context,
                        resourceType,
                        resources
                    )
                );
            }
        }

        const unknownResourceGroups = UnknownResourceTreeNode.getRootGroups(
            connectionManager,
            bundleRemoteState,
            KNOWN_RESOURCE_TYPES
        );
        for (const [type, resources] of unknownResourceGroups) {
            if (resources.length > 0) {
                roots.push(
                    new ResourceTypeHeaderTreeNode(context, type, resources)
                );
            }
        }

        return roots;
    }
}
