import {Disposable, ProgressLocation, window} from "vscode";
import {BundleRemoteStateModel} from "./models/BundleRemoteStateModel";
import {onError} from "../utils/onErrorDecorator";
import {BundleWatcher} from "./BundleWatcher";
import {
    TreeNode as BundleResourceExplorerTreeNode,
    ResourceTreeNode as BundleResourceExplorerResourceTreeNode,
} from "../ui/bundle-resource-explorer/types";
import {BundleRunStatusManager} from "./run/BundleRunStatusManager";
import {Mutex} from "../locking";

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

    constructor(
        private readonly bundleRemoteStateModel: BundleRemoteStateModel,
        private readonly bundleRunStatusManager: BundleRunStatusManager,
        private readonly bundleWatcher: BundleWatcher
    ) {
        this.disposables.push(
            this.outputChannel,
            this.bundleWatcher.onDidChange(async () => {
                await this.bundleRemoteStateModel.refresh();
            })
        );
    }

    private refreshStateMutex = new Mutex();

    @Mutex.synchronise("refreshStateMutex")
    async refreshRemoteState() {
        await window.withProgress(
            {location: {viewId: "dabsResourceExplorerView"}},
            async () => {
                await this.bundleRemoteStateModel.refresh();
            }
        );
    }

    private writeToChannel = (data: string) => {
        this.outputChannel.append(data);
    };

    private prepareOutputChannel() {
        this.outputChannel.show(true);
        this.outputChannel.appendLine("");
    }

    @onError({popup: {prefix: "Error refreshing remote state."}})
    async refreshRemoteStateCommand() {
        await this.refreshRemoteState();
    }

    private deployMutex = new Mutex();

    @Mutex.synchronise("deployMutex")
    async deploy() {
        this.prepareOutputChannel();
        await window.withProgress(
            {location: ProgressLocation.Notification, cancellable: false},
            async () => {
                await this.bundleRemoteStateModel.deploy(
                    this.writeToChannel,
                    this.writeToChannel
                );
            }
        );

        await this.refreshRemoteState();
    }

    @onError({popup: {prefix: "Error deploying the bundle."}})
    async deployCommand() {
        await this.deploy();
    }

    @onError({popup: {prefix: "Error running resource."}})
    async deployAndRun(treeNode: BundleResourceExplorerTreeNode) {
        if (!isRunnable(treeNode)) {
            throw new Error(`Cannot run resource of type ${treeNode.type}`);
        }
        //TODO: Don't deploy if there is no diff between local and remote state
        await this.deploy();

        await this.bundleRunStatusManager.run(
            treeNode.resourceKey,
            treeNode.type
        );
    }

    @onError({popup: {prefix: "Error cancelling run."}})
    async cancelRun(treeNode: BundleResourceExplorerTreeNode) {
        if (!isRunnable(treeNode)) {
            throw new Error(`Resource of ${treeNode.type} is not runnable`);
        }

        this.bundleRunStatusManager.cancel(treeNode.resourceKey);
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
