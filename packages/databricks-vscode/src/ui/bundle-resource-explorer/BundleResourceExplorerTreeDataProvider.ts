import {
    Disposable,
    Event,
    EventEmitter,
    ExtensionContext,
    ProviderResult,
    TreeDataProvider,
} from "vscode";
import {BundleResourceExplorerTreeItem, Renderer, TreeNode} from "./types";
import {ConfigModel} from "../../configuration/models/ConfigModel";
import {JobsRenderer} from "./JobsRenderer";
import {onError} from "../../utils/onErrorDecorator";
import {TasksRenderer} from "./TasksRenderer";
import {PipelineRenderer} from "./PipelineRenderer";

export class BundleResourceExplorerTreeDataProvider
    implements TreeDataProvider<TreeNode>
{
    private disposables: Disposable[] = [];
    private _onDidChangeTreeData: EventEmitter<TreeNode | undefined | void> =
        new EventEmitter<TreeNode | undefined | void>();
    readonly onDidChangeTreeData: Event<TreeNode | undefined | void> =
        this._onDidChangeTreeData.event;

    private renderers: Array<Renderer> = [
        new JobsRenderer(this.context),
        new PipelineRenderer(this.context),
        new TasksRenderer(this.context),
    ];
    constructor(
        private readonly configModel: ConfigModel,
        private readonly context: ExtensionContext
    ) {
        this.disposables.push(
            this.configModel.onDidChangeTarget(() => {
                this._onDidChangeTreeData.fire();
            }),
            this.configModel.onDidChangeKey("remoteStateConfig")(() => {
                this._onDidChangeTreeData.fire();
            })
        );
    }

    @onError({popup: {prefix: "Error rendering DABs Resource Viewer"}})
    async getTreeItem(
        element: TreeNode
    ): Promise<BundleResourceExplorerTreeItem> {
        if (element.type === "treeItem") {
            return element.treeItem;
        }

        const renderer = this.renderers.find((r) => r.type === element.type);
        if (renderer === undefined) {
            throw new Error(
                `No renderer found for element type ${element.type}`
            );
        }

        const treeItem = await renderer.getTreeItem(element);
        switch ((element.data as any).modified_status) {
            case "CREATED":
                treeItem.label = {
                    label: `Created ${treeItem.label}`,
                    highlights: [[0, 7]],
                };
                break;
            case "DELETED":
                treeItem.label = {
                    label: `Deleted ${treeItem.label}`,
                    highlights: [[0, 7]],
                };
                break;
        }

        return treeItem;
    }

    private async getRoots(): Promise<TreeNode[]> {
        const remoteStateConfig =
            await this.configModel.get("remoteStateConfig");
        if (remoteStateConfig?.resources === undefined) {
            return [];
        }
        return (
            await Promise.all(
                this.renderers.map((r) => r.getRoots(remoteStateConfig))
            )
        ).flat();
    }

    @onError({popup: {prefix: "Error rendering DABs Resource Viewer"}})
    async getChildren(element?: TreeNode) {
        if (element === undefined) {
            return this.getRoots();
        }
        return (
            await Promise.all(this.renderers.map((r) => r.getChildren(element)))
        ).flat();
    }

    getParent(element: TreeNode): ProviderResult<TreeNode> {
        return element.parent;
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
