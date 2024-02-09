import {Disposable, ProgressLocation, window} from "vscode";
import {BundleRemoteStateModel} from "../../bundle/models/BundleRemoteStateModel";
import {onError} from "../../utils/onErrorDecorator";
import {BundleResourceExplorerTreeNode} from "./types";
import {BundleRunStatusManager} from "../../bundle/run/BundleRunStatusManager";
import {Mutex} from "../../locking";
import {BundleValidateModel} from "../../bundle/models/BundleValidateModel";
import {PipelineTreeNode} from "./PipelineTreeNode";
import {JobTreeNode} from "./JobTreeNode";
import {CustomWhenContext} from "../../vscode-objs/CustomWhenContext";

export const RUNNABLE_BUNDLE_RESOURCES = [
    "pipelines",
    "jobs",
] satisfies BundleResourceExplorerTreeNode["type"][];

type RunnableTreeNodes = PipelineTreeNode | JobTreeNode;

function isRunnable(
    treeNode: BundleResourceExplorerTreeNode
): treeNode is RunnableTreeNodes {
    return (RUNNABLE_BUNDLE_RESOURCES as string[]).includes(treeNode.type);
}

export class BundleCommands implements Disposable {
    private disposables: Disposable[] = [];
    private outputChannel = window.createOutputChannel(
        "Databricks Asset Bundles"
    );

    constructor(
        private readonly bundleRemoteStateModel: BundleRemoteStateModel,
        private readonly bundleRunStatusManager: BundleRunStatusManager,
        private readonly bundleValidateModel: BundleValidateModel,
        private readonly whenContext: CustomWhenContext
    ) {
        this.disposables.push(
            this.outputChannel,
            this.bundleValidateModel.onDidChange(async () => {
                await this.refreshRemoteState();
            }),
            this.bundleRemoteStateModel.refreshCliListeners.onStderr(
                this.writeToChannel.bind(this)
            ),
            this.bundleRemoteStateModel.refreshCliListeners.onStdout(
                this.writeToChannel.bind(this)
            ),
            this.bundleRemoteStateModel.refreshCliListeners.onError(
                this.showLogsMessage.bind(this)
            ),
            this.bundleValidateModel.refreshCliListeners.onStderr(
                this.writeToChannel.bind(this)
            ),
            this.bundleValidateModel.refreshCliListeners.onStdout(
                this.writeToChannel.bind(this)
            ),
            this.bundleValidateModel.refreshCliListeners.onError(
                this.showLogsMessage.bind(this)
            )
        );
    }

    private async showLogsMessage(e: unknown) {
        if (e instanceof Error) {
            this.writeToChannel(e.message);
        }

        const choice = await window.showErrorMessage(
            "Error refreshing bundle state",
            "Show logs"
        );
        if (choice === "Show logs") {
            this.outputChannel.show();
        }
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
        try {
            this.whenContext.setDeploymentState("deploying");
            this.prepareOutputChannel();
            await window.withProgress(
                {location: ProgressLocation.Notification, cancellable: false},
                async () => {
                    await this.bundleRemoteStateModel.deploy();
                }
            );
            await this.refreshRemoteState();
        } finally {
            this.whenContext.setDeploymentState("idle");
        }
    }

    async deployCommand() {
        try {
            await this.deploy();
        } catch (e) {
            const choice = await window.showErrorMessage(
                "Databricks: Error deploying resource.",
                "Show Logs"
            );
            if (choice === "Show Logs") {
                this.outputChannel.show();
            }
        }
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
