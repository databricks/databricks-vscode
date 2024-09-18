import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {exists} from "fs-extra";
import {exec} from "child_process";
import {promisify} from "node:util";
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
import {WorkspaceFolderManager} from "../../vscode-objs/WorkspaceFolderManager";
import {StateStorage} from "../../vscode-objs/StateStorage";

const execPromise = promisify(exec);

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
        private readonly telemetry: Telemetry,
        private readonly workspaceFolderManager: WorkspaceFolderManager,
        private readonly stateStorage: StateStorage
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
    async deploy(force = false) {
        try {
            this.whenContext.setDeploymentState("deploying");
            await this.checkGitignoreRules();
            const mode = await this.configModel.get("mode");
            const target = this.configModel.target;
            if (mode !== "development") {
                const choice = await window.showInformationMessage(
                    `Deploying bundle to ${humaniseMode(
                        mode
                    )} target "${target}".`,
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
                {location: ProgressLocation.Notification, cancellable: false},
                async () => {
                    await this.bundleRemoteStateModel.deploy(force);
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
                {location: ProgressLocation.Notification, cancellable: false},
                async () => {
                    await this.bundleRemoteStateModel.destroy(force);
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

    private async checkGitignoreRules(): Promise<void> {
        const workspaceFolderPath =
            this.workspaceFolderManager.activeWorkspaceFolder.uri.fsPath;

        const foldersToSkip = this.stateStorage.get(
            "databricks.bundle.skipGitignoreCheck"
        );

        if (foldersToSkip?.includes(workspaceFolderPath)) {
            return;
        }

        const possibleEnvironments = [
            {name: ".venv", path: path.join(workspaceFolderPath, ".venv")},
            {name: ".conda", path: path.join(workspaceFolderPath, ".conda")},
        ];

        const existingEnvironments = [];
        for (const env of possibleEnvironments) {
            if (await exists(env.path)) {
                existingEnvironments.push(env);
            }
        }

        const nonIgnoredEnvironments = [];
        for (const env of existingEnvironments) {
            if (!(await isFolderIgnoredByGit(env.path))) {
                nonIgnoredEnvironments.push(env);
            }
        }
        if (nonIgnoredEnvironments.length === 0) {
            return;
        }

        const choice = await window.showInformationMessage(
            `.gitignore doesn't contain your virtual environment. Would you like to update .gitignore rules to avoid uploading it to your Databricks workspace?`,
            {modal: true},
            "Update .gitignore",
            "Don't update for this project"
        );
        if (choice === "Update .gitignore") {
            const gitignorePath = path.join(workspaceFolderPath, ".gitignore");
            const newContent = nonIgnoredEnvironments
                .map((env) => env.name)
                .join(os.EOL);
            await fs.appendFile(gitignorePath, os.EOL + newContent + os.EOL);
        } else if (choice === "Don't update for this project") {
            this.stateStorage.set("databricks.bundle.skipGitignoreCheck", [
                ...foldersToSkip,
                workspaceFolderPath,
            ]);
        }
    }
}

async function isFolderIgnoredByGit(folderPath: string): Promise<boolean> {
    try {
        const {stdout} = await execPromise(`git check-ignore ${folderPath}`);
        return stdout.trim() === folderPath;
    } catch (error) {
        return false;
    }
}
