import {
    Cluster,
    WorkspaceFsEntity,
    WorkspaceFsUtils,
} from "@databricks/databricks-sdk";
import {commands, Disposable, window, EventEmitter} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {CodeSynchronizer} from "../sync";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {WorkspaceStateManager} from "../vscode-objs/WorkspaceState";

export async function switchToRepos() {
    await workspaceConfigs.setSyncDestinationType("repo");
    commands.executeCommand("workbench.action.reloadWindow");
}

export async function switchToWorkspace() {
    await workspaceConfigs.setSyncDestinationType("workspace");
    commands.executeCommand("workbench.action.reloadWindow");
}

async function dbrBelowThreshold(cluster: Cluster) {
    const dbrVersionParts = cluster.dbrVersion!;
    return (
        (dbrVersionParts[0] !== "x" && dbrVersionParts[0] < 11) ||
        (dbrVersionParts[0] === 11 &&
            dbrVersionParts[1] !== "x" &&
            dbrVersionParts[1] < 2)
    );
}

export async function switchToWorkspacePrompt(
    workspaceState: WorkspaceStateManager
) {
    const message =
        "The Databricks extension works better when using the workspace as sync destination.";
    const selection = await window.showErrorMessage(
        message,
        "Switch to Workspace",
        "Ignore",
        "Don't show again"
    );

    if (selection === "Don't show again") {
        workspaceState.skipSwitchToWorkspace = true;
        return;
    }

    if (selection === "Switch to Workspace") {
        switchToWorkspace();
    }
}

export class WorkspaceFsAccessVerifier implements Disposable {
    private disposables: Disposable[] = [];
    private currentCluster: Cluster | undefined;
    private _isEnabled: boolean | undefined;
    private readonly onDidChangeStateEmitter = new EventEmitter<
        boolean | undefined
    >();
    readonly onDidChangeState = this.onDidChangeStateEmitter.event;

    private set isEnabled(value: boolean | undefined) {
        if (this._isEnabled !== value) {
            this.onDidChangeStateEmitter.fire(value);
        }
        this._isEnabled = value;
    }

    public get isEnabled() {
        return this._isEnabled;
    }

    constructor(
        private _connectionManager: ConnectionManager,
        private readonly workspaceState: WorkspaceStateManager,
        private _sync: CodeSynchronizer
    ) {
        this.disposables.push(
            this._connectionManager.onDidChangeCluster(async (cluster) => {
                if (this.currentCluster?.name === cluster?.name) {
                    return;
                }
                this.currentCluster = cluster;
                this.verifyCluster(cluster);
            }),
            this._connectionManager.onDidChangeState(async (state) => {
                if (state === "CONNECTED") {
                    await this.verifyWorkspaceConfigs();
                } else {
                    this.isEnabled = undefined;
                }
            }),
            this._sync.onDidChangeState(async (state) => {
                if (
                    workspaceConfigs.syncDestinationType === "repo" &&
                    state === "FILES_IN_REPOS_DISABLED"
                ) {
                    await window.showErrorMessage(
                        "Sync failed. Files in Repos is disabled for the current workspace. Please contact your system admin to enable it for your workspace."
                    );
                } else if (
                    workspaceConfigs.syncDestinationType === "workspace" &&
                    state === "FILES_IN_WORKSPACE_DISABLED"
                ) {
                    this.isEnabled = false;
                    const selection = await window.showErrorMessage(
                        "Sync failed. Files in Workspace is disabled for the current workspace.",
                        "Switch to Repos",
                        "Ignore"
                    );

                    if (selection === "Switch to Repos") {
                        switchToRepos();
                    }
                }
            })
        );
    }

    async verifyCluster(cluster?: Cluster) {
        if (cluster === undefined) {
            return;
        }
        if (await dbrBelowThreshold(cluster)) {
            if (workspaceConfigs.syncDestinationType === "repo") {
                return;
            }
            const message =
                "Files in workspace is not supported on clusters with DBR < 11.2.";
            const selection = await window.showErrorMessage(
                message,
                "Switch to Repos",
                "Ignore"
            );
            if (selection === "Switch to Repos") {
                switchToRepos();
            }
        } else {
            if (
                workspaceConfigs.syncDestinationType === "workspace" ||
                !this.workspaceState.wsfsFeatureFlag ||
                !(await this.isEnabledForWorkspace()) ||
                this.workspaceState.skipSwitchToWorkspace
            ) {
                return;
            }
            switchToWorkspacePrompt(this.workspaceState);
        }
    }

    private async isEnabledForWorkspace() {
        if (this._connectionManager.state === "DISCONNECTED") {
            return false;
        }
        await this._connectionManager.waitForConnect();
        if (this.isEnabled !== undefined) {
            return this.isEnabled;
        }
        const rootPath =
            this._connectionManager.databricksWorkspace?.workspaceFsRoot;
        if (!rootPath || !this._connectionManager.workspaceClient) {
            return false;
        }

        const rootDir = await WorkspaceFsEntity.fromPath(
            this._connectionManager.workspaceClient,
            rootPath.path
        );

        if (!WorkspaceFsUtils.isDirectory(rootDir)) {
            return false;
        }
        try {
            await rootDir.createFile(
                ".sentinal.tmp",
                "This file is autogenerated by the Databricks Extension for VS Code"
            );
        } catch (e: unknown) {
            if (e instanceof Error) {
                if (
                    e.message.match(
                        /.*(Files in Workspace is disabled|FEATURE_DISABLED).*/
                    )
                ) {
                    this.isEnabled = false;
                    return this.isEnabled;
                }
            }
        }

        this.isEnabled = true;
        return this.isEnabled;
    }

    async verifyWorkspaceConfigs() {
        if (
            workspaceConfigs.enableFilesInWorkspace &&
            !(await this.isEnabledForWorkspace())
        ) {
            const selection = await window.showErrorMessage(
                "Files in workspace is not enabled for your workspace",
                "Switch to Repos",
                "Ignore"
            );

            if (selection === "Switch to Repos") {
                switchToRepos();
            }
        }
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
