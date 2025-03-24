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
import {BundleRunType} from "../../telemetry/constants";
import {BundlePipelinesManager} from "../../bundle/BundlePipelinesManager";
export const RUNNABLE_BUNDLE_RESOURCES = [
    "pipelines",
    "jobs",
] satisfies BundleResourceExplorerTreeNode["type"][];

type RunnableTreeNodes = PipelineTreeNode | JobTreeNode;
type ResourceData = {type: string; resourceKey?: string};

function isRunnable(treeNode: ResourceData): treeNode is RunnableTreeNodes {
    return (RUNNABLE_BUNDLE_RESOURCES as string[]).includes(treeNode.type);
}

export class BundleCommands implements Disposable {
    private disposables: Disposable[] = [];

    constructor(
        private readonly bundleRemoteStateModel: BundleRemoteStateModel,
        private readonly bundleRunStatusManager: BundleRunStatusManager,
        private readonly bundlePipelinesManager: BundlePipelinesManager,
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
                    title: "Uploading bundle assets",
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
            const viewProgressOptions = {
                location: {viewId: "dabsResourceExplorerView"},
            };
            const notificationProgressOptions = {
                location: ProgressLocation.Notification,
                title: title,
                cancellable: true,
            };
            await window.withProgress(viewProgressOptions, () =>
                window.withProgress(
                    notificationProgressOptions,
                    (progress, token) =>
                        this.bundleRemoteStateModel.deploy(force, token)
                )
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
    async deployAndRun(
        resourceData: ResourceData,
        additionalArgs: string[] = [],
        runType: BundleRunType = "run"
    ) {
        if (!isRunnable(resourceData)) {
            throw new Error(`Cannot run resource of type ${resourceData.type}`);
        }
        const recordEvent = this.telemetry.start(Events.BUNDLE_RUN);
        try {
            // TODO: Don't deploy if there is no diff between local and remote state
            await this.deploy();
            const result = await this.bundleRunStatusManager.run(
                resourceData.resourceKey,
                resourceData.type,
                additionalArgs
            );
            recordEvent({
                success: true,
                runType,
                resourceType: resourceData.type,
                cancelled: result.cancelled,
            });
        } catch (e) {
            recordEvent({
                success: false,
                resourceType: resourceData.type,
                runType,
            });
            throw e;
        }
    }

    async deployAndRunFromInput(
        options: {
            resourceType?: string;
            resourceKey?: string;
            args?: string;
        } = {}
    ) {
        let {resourceType, resourceKey} = options;
        if (!resourceType || !resourceKey) {
            const remoteState = await this.configModel.get("remoteStateConfig");
            const pipelines = remoteState?.resources?.pipelines ?? {};
            const pipelineItems = Object.keys(pipelines).map((key) => ({
                label: key,
                description: "Pipeline",
                type: "pipelines",
                key: `pipelines.${key}`,
            }));
            const jobs = remoteState?.resources?.jobs ?? {};
            const jobItems = Object.keys(jobs).map((key) => ({
                label: key,
                description: "Job",
                type: "jobs",
            }));
            if (pipelineItems.length === 0 && jobItems.length === 0) {
                window.showErrorMessage(
                    "No pipelines or jobs found in the bundle."
                );
                return;
            }
            const pick = await window.showQuickPick(
                [...pipelineItems, ...jobItems],
                {
                    placeHolder: "Select a pipeline or a job to run",
                }
            );
            if (!pick) {
                return;
            }
            resourceType = pick.type;
            resourceKey = pick.label;
        }
        const resourceData = {
            type: resourceType,
            resourceKey: `${resourceType}.${resourceKey}`,
        };
        const existingRun = this.bundleRunStatusManager.runStatuses.get(
            resourceData.resourceKey
        );
        if (
            existingRun?.runState === "running" ||
            existingRun?.runState === "unknown"
        ) {
            window.showErrorMessage(
                `A run for the "${resourceData.resourceKey}" is already in progress.`
            );
        } else {
            const args = options.args?.split(" ").filter(Boolean);
            return this.deployAndRun(resourceData, args, "manual-input");
        }
    }

    async deployAndValidate(treeNode: BundleResourceExplorerTreeNode) {
        return this.deployAndRun(treeNode, ["--validate-only"], "validate");
    }

    async deployAndRunSelectedTables(treeNode: BundleResourceExplorerTreeNode) {
        if (!isRunnable(treeNode)) {
            throw new Error(`Cannot run resource of type ${treeNode.type}`);
        }
        const key = treeNode.resourceKey;
        const result =
            await this.bundlePipelinesManager.showTableSelectionQuickPick(key);
        if (!result.tables || result.tables.length === 0) {
            return;
        }
        return this.deployAndRun(
            treeNode,
            [
                result.fullRefresh ? "--full-refresh" : "--refresh",
                result.tables,
            ],
            "partial-refresh"
        );
    }

    @onError({popup: {prefix: "Error clearing diagnostics."}})
    clearPipelineDiagnostics() {
        this.bundlePipelinesManager.clearDiagnostics();
    }

    @onError({popup: {prefix: "Error showing event details."}})
    async showPipelineEventDetails(item: any) {
        await this.bundlePipelinesManager.showPipelineEventDetails(item.event);
    }

    @onError({popup: {prefix: "Error cancelling run."}})
    async cancelRun(treeNode: BundleResourceExplorerTreeNode) {
        if (!isRunnable(treeNode)) {
            throw new Error(`Resource of ${treeNode.type} is not runnable`);
        }

        this.bundleRunStatusManager.cancel(treeNode.resourceKey);
    }

    async destroy(force = false, warn = true) {
        if (warn) {
            const choice = await window.showWarningMessage(
                "Are you sure you want to destroy this bundle and all resources associated with it?",
                {modal: true},
                "Yes, continue",
                "No"
            );
            if (choice !== "Yes, continue") {
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
