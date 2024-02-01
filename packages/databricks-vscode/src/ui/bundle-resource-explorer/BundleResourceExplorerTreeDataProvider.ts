import {
    Disposable,
    Event,
    EventEmitter,
    ExtensionContext,
    ProviderResult,
    TreeDataProvider,
} from "vscode";
import {
    BundleResourceExplorerTreeItem,
    BundleResourceExplorerTreeNode,
} from "./types";
import {ConfigModel} from "../../configuration/models/ConfigModel";
import {BundleRunStatusManager} from "../../bundle/run/BundleRunStatusManager";
import {ConnectionManager} from "../../configuration/ConnectionManager";
import {ResourceTypeHeaderTreeNode} from "./ResourceTypeHeaderTreeNode";

export class BundleResourceExplorerTreeDataProvider
    implements TreeDataProvider<BundleResourceExplorerTreeNode>
{
    private disposables: Disposable[] = [];
    private _onDidChangeTreeData: EventEmitter<
        BundleResourceExplorerTreeNode | undefined | void
    > = new EventEmitter<BundleResourceExplorerTreeNode | undefined | void>();
    readonly onDidChangeTreeData: Event<
        BundleResourceExplorerTreeNode | undefined | void
    > = this._onDidChangeTreeData.event;

    constructor(
        private readonly configModel: ConfigModel,
        private readonly bundleRunStatusManager: BundleRunStatusManager,
        private readonly context: ExtensionContext,
        private readonly connectionManager: ConnectionManager
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
        element: BundleResourceExplorerTreeNode
    ): Promise<BundleResourceExplorerTreeItem> {
        return element.getTreeItem();
    }

    async getChildren(element?: BundleResourceExplorerTreeNode) {
        if (element === undefined) {
            const bundleRemoteState =
                await this.configModel.get("remoteStateConfig");
            if (bundleRemoteState === undefined) {
                return [];
            }
            return ResourceTypeHeaderTreeNode.getRoots(
                this.context,
                this.bundleRunStatusManager,
                this.connectionManager,
                bundleRemoteState
            );
        }
        return element.getChildren();
    }

    getParent(
        element: BundleResourceExplorerTreeNode
    ): ProviderResult<BundleResourceExplorerTreeNode> {
        return element.parent;
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
