import {Disposable, window} from "vscode";
import {BundleRemoteStateModel} from "./models/BundleRemoteStateModel";
import {onError} from "../utils/onErrorDecorator";
import {
    TreeNode as BundleResourceExplorerTreeNode,
    ResourceTreeNode as BundleResourceExplorerResourceTreeNode,
} from "../ui/bundle-resource-explorer/types";
import {BundleRunManager} from "./BundleRunManager";

const RUNNABLE_RESOURCES = [
    "pipelines",
    "jobs",
] satisfies BundleResourceExplorerTreeNode["type"][];

function isRunnable(
    treeNode: BundleResourceExplorerTreeNode
): treeNode is BundleResourceExplorerResourceTreeNode {
    return (RUNNABLE_RESOURCES as string[]).includes(treeNode.type);
}

export class BundleCommands implements Disposable {
    private disposables: Disposable[] = [];
    private outputChannel = window.createOutputChannel(
        "Databricks Asset Bundles"
    );

    private writeToChannel = (data: string) => {
        this.outputChannel.append(data);
    };

    private prepareOutputChannel() {
        this.outputChannel.show(true);
        this.outputChannel.appendLine("");
    }

    constructor(
        private readonly bundleRemoteStateModel: BundleRemoteStateModel,
        private readonly bundleRunManager: BundleRunManager
    ) {
        this.disposables.push(this.outputChannel);
    }

    @onError({popup: {prefix: "Error refreshing remote state."}})
    async refreshRemoteState() {
        await this.bundleRemoteStateModel.refresh();
    }

    @onError({popup: {prefix: "Error deploying the bundle."}})
    async deploy() {
        await window.withProgress(
            {location: {viewId: "dabsResourceExplorerView"}},
            async () => {
                await this.bundleRemoteStateModel.deploy(
                    this.writeToChannel,
                    this.writeToChannel
                );
            }
        );
    }

    @onError({popup: {prefix: "Error running resource."}})
    async deployAndRun(treeNode: BundleResourceExplorerTreeNode) {
        if (!isRunnable(treeNode)) {
            throw new Error(`Cannot run resource of type ${treeNode.type}`);
        }
        //TODO: Don't deploy if there is no diff between local and remote state
        this.prepareOutputChannel();
        await window.withProgress(
            {location: {viewId: "dabsResourceExplorerView"}},
            async () => {
                await this.bundleRemoteStateModel.deploy(
                    this.writeToChannel,
                    this.writeToChannel
                );
            }
        );

        await this.bundleRunManager.run(treeNode.resourceKey);
    }

    @onError({popup: {prefix: "Error cancelling run."}})
    async cancelRun() {
        this.bundleRunManager.cancelAll();
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
