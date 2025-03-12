import {BundleRemoteState} from "../../bundle/models/BundleRemoteStateModel";
import {
    BundleResourceExplorerResourceKey,
    BundleResourceExplorerTreeItem,
    BundleResourceExplorerTreeNode,
} from "./types";
import {ContextUtils} from "./utils";
import {DecorationUtils} from "../utils";
import {TreeItemCollapsibleState, Location} from "vscode";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {getSourceLocation} from "./utils/SourceLocationUtils";

type UnknownResourcesMap = Map<
    BundleResourceExplorerResourceKey,
    BundleResourceExplorerTreeNode[]
>;

export class UnknownResourceTreeNode implements BundleResourceExplorerTreeNode {
    readonly type = "unknown_resource";

    constructor(
        private readonly connectionManager: ConnectionManager,
        public readonly resourceType: BundleResourceExplorerResourceKey,
        public readonly resourceKey: string,
        public readonly data: any,
        private readonly locations: BundleRemoteState["__locations"],
        public parent?: BundleResourceExplorerTreeNode
    ) {}

    get url(): string | undefined {
        return this.data.url;
    }

    get sourceLocation(): Location | undefined {
        return getSourceLocation(
            this.locations,
            this.connectionManager.projectRoot,
            `${this.resourceType}.${this.resourceKey}`
        );
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
                hasSourceLocation: this.sourceLocation !== undefined,
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
        connectionManager: ConnectionManager,
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
                            connectionManager,
                            type,
                            key,
                            resources[key],
                            bundleRemoteState.__locations
                        );
                    })
                );
            }
            return result;
        }, new Map() as UnknownResourcesMap);
    }
}
