import {
    Disposable,
    Event,
    EventEmitter,
    ExtensionContext,
    ProviderResult,
    TreeDataProvider,
    TreeItemCollapsibleState,
} from "vscode";
import {BundleResourceExplorerTreeItem, Renderer, TreeNode} from "./types";
import {ConfigModel} from "../../configuration/models/ConfigModel";
import {JobsRenderer} from "./JobsRenderer";
import {TasksRenderer} from "./TasksRenderer";
import {PipelineRenderer} from "./PipelineRenderer";
import path from "path";
import {BundleRunStatusManager} from "../../bundle/run/BundleRunStatusManager";
import {JobsRunStatusRenderer} from "./JobsRunStatusRenderer";
import {TaskRunStatusRenderer} from "./TaskRunStatusRenderer";
import {PipelineRunStatusRenderer} from "./PipelineRunStatusRenderer";

function humaniseResourceType(type: TreeNode["type"]) {
    switch (type) {
        case "pipelines":
            return "Pipelines";
        case "jobs":
            return "Workflows";
        default:
            return type;
    }
}
export class BundleResourceExplorerTreeDataProvider
    implements TreeDataProvider<TreeNode>
{
    private disposables: Disposable[] = [];
    private _onDidChangeTreeData: EventEmitter<TreeNode | undefined | void> =
        new EventEmitter<TreeNode | undefined | void>();
    readonly onDidChangeTreeData: Event<TreeNode | undefined | void> =
        this._onDidChangeTreeData.event;

    private renderers: Array<Renderer> = [
        new JobsRenderer(this.bundleRunStatusManager),
        new PipelineRenderer(this.bundleRunStatusManager),
        new TasksRenderer(this.context),
        new JobsRunStatusRenderer(),
        new TaskRunStatusRenderer(),
        new PipelineRunStatusRenderer(),
    ];
    constructor(
        private readonly configModel: ConfigModel,
        private readonly bundleRunStatusManager: BundleRunStatusManager,
        private readonly context: ExtensionContext
    ) {
        this.disposables.push(
            this.configModel.onDidChangeTarget(() => {
                this._onDidChangeTreeData.fire();
            }),
            this.configModel.onDidChangeKey("remoteStateConfig")(() => {
                this._onDidChangeTreeData.fire();
            }),
            this.bundleRunStatusManager.onDidChange(() => {
                this._onDidChangeTreeData.fire();
            })
        );
    }

    async getTreeItem(
        element: TreeNode
    ): Promise<BundleResourceExplorerTreeItem> {
        if (element.type === "treeItem") {
            return element.treeItem;
        }
        if (element.type === "resource_type_header") {
            return {
                label: humaniseResourceType(element.resourceType),
                iconPath: this.getIconPath(element.resourceType),
                contextValue: `${element.resourceType}-header`,
                collapsibleState: TreeItemCollapsibleState.Expanded,
            };
        }

        const renderer = this.renderers.find((r) => r.type === element.type);
        if (renderer === undefined) {
            throw new Error(
                `No renderer found for element type ${element.type}`
            );
        }

        const treeItem = renderer.getTreeItem(element);
        const modifiedStatus = (element as any).data?.modified_status as string;
        if (modifiedStatus === undefined) {
            return treeItem;
        }

        treeItem.label = {
            label: `${modifiedStatus.charAt(0).toUpperCase()}${modifiedStatus
                .slice(1)
                .toLowerCase()} ${treeItem.label}`,
            highlights: [[0, modifiedStatus.length]],
        };

        return treeItem;
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

    private async getRoots(): Promise<TreeNode[]> {
        const remoteStateConfig = await this.configModel.get(
            "remoteStateConfig"
        );
        if (remoteStateConfig?.resources === undefined) {
            return [];
        }
        return this.renderers
            .map((r) => {
                const children = r.getRoots(remoteStateConfig);
                if (children.length === 0) {
                    return [];
                }
                return [
                    {
                        type: "resource_type_header",
                        parent: undefined,
                        resourceType: r.type,
                        children,
                    },
                    {
                        type: "treeItem",
                        parent: undefined,
                        treeItem: {
                            label: "",
                            contextValue: "spacer",
                            collapsibleState: TreeItemCollapsibleState.None,
                        },
                    },
                ] as TreeNode[];
            })
            .flat();
    }

    async getChildren(element?: TreeNode) {
        if (element === undefined) {
            return await this.getRoots();
        }
        if (element.type === "resource_type_header") {
            return element.children;
        }
        return this.renderers.map((r) => r.getChildren(element)).flat();
    }

    getParent(element: TreeNode): ProviderResult<TreeNode> {
        return element.parent;
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
