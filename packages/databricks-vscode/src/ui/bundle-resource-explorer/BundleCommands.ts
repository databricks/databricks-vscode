import {Disposable, ProgressLocation, window} from "vscode";
import {BundleRemoteStateModel} from "../../bundle/models/BundleRemoteStateModel";
import {onError} from "../../utils/onErrorDecorator";
import {BundleResourceExplorerTreeNode} from "./types";
import {BundleRunStatusManager} from "../../bundle/run/BundleRunStatusManager";
import {Mutex} from "../../locking";

export const RUNNABLE_BUNDLE_RESOURCES = [
    "pipelines",
    "jobs",
] satisfies BundleResourceExplorerTreeNode["type"][];

function isRunnable(
    type: string
): type is (typeof RUNNABLE_BUNDLE_RESOURCES)[number] {
    return (RUNNABLE_BUNDLE_RESOURCES as string[]).includes(type);
}

export class BundleCommands implements Disposable {
    private disposables: Disposable[] = [];
    private outputChannel = window.createOutputChannel(
        "Databricks Asset Bundles"
    );

    constructor(
        private readonly bundleRemoteStateModel: BundleRemoteStateModel,
        private readonly bundleRunStatusManager: BundleRunStatusManager
    ) {
        this.disposables.push(this.outputChannel);
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
        const type = treeNode.type;
        if (!isRunnable(type)) {
            throw new Error(`Cannot run resource of type ${type}`);
        }
        //TODO: Don't deploy if there is no diff between local and remote state
        await this.deploy();

        await this.bundleRunStatusManager.run(
            (treeNode as any).resourceKey,
            type
        );
    }

    @onError({popup: {prefix: "Error cancelling run."}})
    async cancelRun(treeNode: BundleResourceExplorerTreeNode) {
        const type = treeNode.type;
        if (!isRunnable(type)) {
            throw new Error(`Resource of ${treeNode.type} is not runnable`);
        }

        this.bundleRunStatusManager.cancel((treeNode as any).resourceKey);
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
