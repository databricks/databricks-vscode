import {Cluster, WorkspaceFsEntity, WorkspaceFsUtils} from "../sdk-extensions";
import {commands, Disposable, window, EventEmitter} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {StateStorage} from "../vscode-objs/StateStorage";
import {Events, Telemetry} from "../telemetry";

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
    stateStorage: StateStorage,
    telemetry: Telemetry
) {
    const message =
        "Databricks recommends switching from Repos to Workspace as sync destination.";
    const selection = await window.showErrorMessage(
        message,
        "Switch to Workspace",
        "Ignore",
        "Don't show again"
    );
    telemetry.recordEvent(Events.SWITCH_TO_WORKSPACE_PROMPT, {
        selection: selection ?? "undefined",
    });

    if (selection === "Don't show again") {
        stateStorage.set("databricks.wsfs.skipSwitchToWorkspace", true);
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
        private connectionManager: ConnectionManager,
        private readonly stateStorage: StateStorage,
        private readonly telemetry: Telemetry
    ) {
        this.disposables.push(
            this.connectionManager.onDidChangeCluster(async (cluster) => {
                if (this.currentCluster?.name === cluster?.name) {
                    return;
                }
                this.currentCluster = cluster;
                this.verifyCluster(cluster);
            }),
            this.connectionManager.onDidChangeState(async (state) => {
                if (state === "CONNECTED") {
                    await this.verifyWorkspaceConfigs();
                } else {
                    this.isEnabled = undefined;
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
                workspaceConfigs.enableFilesInWorkspace ||
                !(await this.isEnabledForWorkspace()) ||
                this.stateStorage.get("databricks.wsfs.skipSwitchToWorkspace")
            ) {
                return;
            }
            switchToWorkspacePrompt(this.stateStorage, this.telemetry);
        }
    }

    async isEnabledForWorkspace() {
        if (this.connectionManager.state === "DISCONNECTED") {
            return false;
        }
        await this.connectionManager.waitForConnect();
        if (this.isEnabled !== undefined) {
            return this.isEnabled;
        }
        const rootPath =
            this.connectionManager.databricksWorkspace?.workspaceFsRoot;
        if (!rootPath || !this.connectionManager.workspaceClient) {
            return false;
        }

        const rootDir = await WorkspaceFsEntity.fromPath(
            this.connectionManager.workspaceClient,
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
