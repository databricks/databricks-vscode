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
import {Events, Telemetry} from "../../telemetry";
import * as lodash from "lodash";
import {ProcessError} from "../../cli/CliWrapper";
import {ConfigModel} from "../../configuration/models/ConfigModel";
import {humaniseMode} from "../utils/BundleUtils";
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
        private readonly configModel: ConfigModel,
        private readonly whenContext: CustomWhenContext,
        private readonly telemetry: Telemetry
    ) {
        this.disposables.push(
            this.bundleValidateModel.onDidChange(async () => {
                // Only refresh if both the validate model and the remote state model are using the same target and auth provider
                if (
                    this.bundleRemoteStateModel.target ===
                        this.bundleValidateModel.target &&
                    lodash.isEqual(
                        this.bundleRemoteStateModel.authProvider,
                        this.bundleValidateModel.authProvider
                    )
                ) {
                    await this.refreshRemoteState();
                }
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

            if (e instanceof ProcessError) {
                e.showErrorMessage("Error refreshing remote state.");
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
    async sync() {
        try {
            this.whenContext.setDeploymentState("deploying");
            await window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title: "Synchronising bundle assets",
                    cancellable: true,
                },
                async (progress, token) => {
                    await this.bundleRemoteStateModel.sync(token);
                }
            );
        } catch (e) {
            if (!(e instanceof Error)) {
                throw e;
            }
            if (e instanceof ProcessError) {
                e.showErrorMessage("Error synchronising bundle assets.");
            }
            throw e;
        } finally {
            this.whenContext.setDeploymentState("idle");
        }
    }

    @Mutex.synchronise("deployMutex")
    async deploy(force = false) {
        try {
            this.whenContext.setDeploymentState("deploying");
            const mode = await this.configModel.get("mode");
            const target = this.configModel.target;
            const prettyMode = humaniseMode(mode);
            const title = `Deploying the bundle to ${prettyMode} target "${target}".`;
            if (mode !== "development") {
                const choice = await window.showInformationMessage(
                    title,
                    {modal: true},
                    "Continue"
                );
                if (choice !== "Continue") {
                    window.showErrorMessage(
                        "Databricks: Deployment cancelled."
                    );
                    return;
                }
            }
            await window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title: title,
                    cancellable: true,
                },
                async (progress, token) => {
                    await this.bundleRemoteStateModel.deploy(force, token);
                }
            );

            await this.refreshRemoteState();
        } catch (e) {
            if (!(e instanceof Error)) {
                throw e;
            }
            if (e instanceof ProcessError) {
                e.showErrorMessage("Error deploying bundle.");
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

    @onError({log: true, popup: false})
    public async forceDeployCommand() {
        await this.deploy(true);
    }

    @onError({popup: {prefix: "Error running resource."}})
    async deployAndRun(treeNode: BundleResourceExplorerTreeNode) {
        if (!isRunnable(treeNode)) {
            throw new Error(`Cannot run resource of type ${treeNode.type}`);
        }
        const recordEvent = this.telemetry.start(Events.BUNDLE_RUN);
        try {
            // TODO: Don't deploy if there is no diff between local and remote state
            await this.deploy();
            const result = await this.bundleRunStatusManager.run(
                treeNode.resourceKey,
                treeNode.type
            );
            recordEvent({
                success: true,
                resourceType: treeNode.type,
                cancelled: result.cancelled,
            });
        } catch (e) {
            recordEvent({success: false, resourceType: treeNode.type});
            throw e;
        }
    }

    @onError({popup: {prefix: "Error cancelling run."}})
    async cancelRun(treeNode: BundleResourceExplorerTreeNode) {
        if (!isRunnable(treeNode)) {
            throw new Error(`Resource of ${treeNode.type} is not runnable`);
        }

        this.bundleRunStatusManager.cancel(treeNode.resourceKey);
    }

    async destroy(force = false) {
        if ((await this.configModel.get("mode")) !== "development") {
            const confirm = await window.showErrorMessage(
                "Are you sure you want to destroy this bundle and all resources associated with it?",
                {modal: true},
                "Yes, continue",
                "No"
            );

            if (confirm !== "Yes, continue") {
                return;
            }
        }

        try {
            this.whenContext.setDeploymentState("deploying");
            await window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title: "Destroying the bundle",
                    cancellable: true,
                },
                async (progress, token) => {
                    await this.bundleRemoteStateModel.destroy(force, token);
                }
            );

            await this.refreshRemoteState();
        } catch (e) {
            if (!(e instanceof Error)) {
                throw e;
            }
            if (e instanceof ProcessError) {
                e.showErrorMessage("Error destroying bundle.");
            }
            throw e;
        } finally {
            this.whenContext.setDeploymentState("idle");
        }
    }

    @onError({log: true, popup: false})
    public async destroyCommand() {
        await this.destroy();
    }

    @onError({log: true, popup: false})
    public async forceDestroyCommand() {
        await this.destroy(true);
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
