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
import {BundlePipelinesManager} from "../../bundle/BundlePipelinesManager";

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
        private readonly context: ExtensionContext,
        private readonly configModel: ConfigModel,
        private readonly connectionManager: ConnectionManager,
        private readonly bundleRunStatusManager: BundleRunStatusManager,
        private readonly pipelinesManager: BundlePipelinesManager
    ) {
        this.disposables.push(
            this.configModel.onDidChangeTarget(() => {
                this._onDidChangeTreeData.fire();
            }),
            this.configModel.onDidChangeKey("remoteStateConfig")(async () => {
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
                this.connectionManager,
                this.bundleRunStatusManager,
                this.pipelinesManager,
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
