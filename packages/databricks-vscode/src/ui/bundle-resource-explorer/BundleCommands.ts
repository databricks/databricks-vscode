import {Disposable, ProgressLocation, window, commands} from "vscode";
import {BundleRemoteStateModel} from "../../bundle/models/BundleRemoteStateModel";
import {onError} from "../../utils/onErrorDecorator";
import {BundleResourceExplorerTreeNode} from "./types";
import {BundleRunStatusManager} from "../../bundle/run/BundleRunStatusManager";
import {Mutex} from "../../locking";
import {BundleValidateModel} from "../../bundle/models/BundleValidateModel";
import {PipelineTreeNode} from "./PipelineTreeNode";
import {JobTreeNode} from "./JobTreeNode";
import {CustomWhenContext} from "../../vscode-objs/CustomWhenContext";
import {Events, Telemetry} from "../../telemetry";
import {BundleRunResourceType} from "../../telemetry/constants";

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

    constructor(
        private readonly bundleRemoteStateModel: BundleRemoteStateModel,
        private readonly bundleRunStatusManager: BundleRunStatusManager,
        private readonly bundleValidateModel: BundleValidateModel,
        private readonly whenContext: CustomWhenContext,
        private readonly telemetry: Telemetry
    ) {
        this.disposables.push(
            this.bundleValidateModel.onDidChange(async () => {
                await this.refreshRemoteState();
            })
        );
    }

    private refreshStateMutex = new Mutex();

    @Mutex.synchronise("refreshStateMutex")
    async refreshRemoteState() {
        try {
            await window.withProgress(
                {location: {viewId: "dabsResourceExplorerView"}},
                async () => {
                    await this.bundleRemoteStateModel.refresh();
                }
            );
        } catch (e: any) {
            if (!(e instanceof Error)) {
                throw e;
            }
            const choice = await window.showErrorMessage(
                "Error refreshing bundle state.",
                "Show Logs"
            );
            if (choice === "Show Logs") {
                commands.executeCommand("databricks.bundle.showLogs");
            }
            throw e;
        }
    }

    @onError({log: true, popup: false})
    public async refreshCommand() {
        await this.refreshRemoteState();
    }

    private deployMutex = new Mutex();

    @Mutex.synchronise("deployMutex")
    async deploy() {
        try {
            this.whenContext.setDeploymentState("deploying");
            await window.withProgress(
                {location: ProgressLocation.Notification, cancellable: false},
                async () => {
                    await this.bundleRemoteStateModel.deploy();
                }
            );

            await this.refreshRemoteState();
        } catch (e) {
            if (!(e instanceof Error)) {
                throw e;
            }
            const choice = await window.showErrorMessage(
                "Error deploying resource.",
                "Show Logs"
            );
            if (choice === "Show Logs") {
                commands.executeCommand("databricks.bundle.showLogs");
            }
            throw e;
        } finally {
            this.whenContext.setDeploymentState("idle");
        }
    }

    @onError({log: true, popup: false})
    public async deployCommand() {
        await this.deploy();
    }

    @onError({popup: {prefix: "Error running resource."}})
    async deployAndRun(treeNode: BundleResourceExplorerTreeNode) {
        if (!isRunnable(treeNode)) {
            throw new Error(`Cannot run resource of type ${treeNode.type}`);
        }
        try {
            // TODO: Don't deploy if there is no diff between local and remote state
            await this.deploy();
            await this.bundleRunStatusManager.run(
                treeNode.resourceKey,
                treeNode.type
            );
            this.recordBundleRun(true, treeNode.type);
        } catch (e) {
            this.recordBundleRun(false, treeNode.type);
            throw e;
        }
    }

    private recordBundleRun(
        success: boolean,
        resourceType: BundleRunResourceType
    ) {
        this.telemetry.recordEvent(Events.BUNDLE_RUN, {success, resourceType});
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
