import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";
import {
    BundleResourceExplorerResourceKey,
    BundleResourceExplorerTreeItem,
    BundleResourceExplorerTreeNode,
} from "./types";
import {ContextUtils} from "./utils";
import {DecorationUtils} from "../utils";
import {TreeItemCollapsibleState} from "vscode";

type UnknownResourcesMap = Map<
    BundleResourceExplorerResourceKey,
    BundleResourceExplorerTreeNode[]
>;

export class UnknownResourceTreeNode implements BundleResourceExplorerTreeNode {
    readonly type = "unknown_resource";

    constructor(
        public readonly resourceType: BundleResourceExplorerResourceKey,
        public readonly resourceKey: string,
        public readonly data: any,
        public parent?: BundleResourceExplorerTreeNode
    ) {}

    get url(): string | undefined {
        return this.data.url;
    }

    getTreeItem(): BundleResourceExplorerTreeItem {
        const name =
            this.data.name ??
            this.data.display_name ??
            this.data.table_name ??
            this.data.cluster_name ??
            this.data.key ??
            this.resourceKey;

        return {
            label: name,
            contextValue: ContextUtils.getContextString({
                resourceType: this.resourceType,
                nodeType: "unknown_resource",
                hasUrl: this.url !== undefined,
                modifiedStatus: this.data.modified_status,
            }),
            resourceUri: DecorationUtils.getModifiedStatusDecoration(
                name,
                this.data.modified_status
            ),
            collapsibleState: TreeItemCollapsibleState.None,
        };
    }

    getChildren(): BundleResourceExplorerTreeNode[] {
        return [];
    }

    static getRootGroups(
        bundleRemoteState: BundleRemoteState,
        knownResourceTypes: readonly string[]
    ): UnknownResourcesMap {
        const allResources = bundleRemoteState.resources || {};
        const allTypes = Object.keys(
            allResources
        ) as BundleResourceExplorerResourceKey[];
        const unknownTypes = allTypes.filter(
            (type) =>
                !knownResourceTypes.includes(type) &&
                Object.keys(allResources[type] || {}).length > 0
        ) as BundleResourceExplorerResourceKey[];

        return unknownTypes.reduce((result, type) => {
            const resources = allResources[type];
            if (resources) {
                result.set(
                    type,
                    Object.keys(resources).map((key) => {
                        return new UnknownResourceTreeNode(
                            type,
                            key,
                            resources[key]
                        );
                    })
                );
            }
            return result;
        }, new Map() as UnknownResourcesMap);
    }
}
