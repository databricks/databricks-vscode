import {
    ApiClient,
    WorkspaceFsEntity,
    WorkspaceFsUtils,
} from "@databricks/databricks-sdk";
import * as assert from "assert";
import path = require("path");
import {Uri} from "vscode";
import {ConnectionManager} from "./ConnectionManager";

type SyncDestinationType = "workspace" | "repo";

/**
 * Either Databricks repo or workspace that acts as a sync target for the current workspace.
 */
export class SyncDestination {
    readonly wsfsDirPath: Uri;
    /**
     * ONLY USE FOR TESTING
     */
    constructor(
        readonly wsfsDir: WorkspaceFsEntity,
        wsfsDirPath: Uri,
        readonly vscodeWorkspacePath: Uri
    ) {
        this.wsfsDirPath = SyncDestination.normalizeWorkspacePath(wsfsDirPath);
    }

    static async validateRemote(
        connectionManager: ConnectionManager,
        remotePath: Uri
    ) {
        remotePath = SyncDestination.normalizeWorkspacePath(remotePath);
        remotePath = Uri.from({
            scheme: "wsfs",
            path: remotePath.path.replace(/^\/Workspace\//, "/"),
        });

        if (
            connectionManager.workspaceClient === undefined ||
            connectionManager.databricksWorkspace === undefined
        ) {
            return false;
        }

        const rootDir = await WorkspaceFsEntity.fromPath(
            connectionManager.workspaceClient.apiClient,
            connectionManager.databricksWorkspace.currentFsRoot.path
        );
        if (
            !WorkspaceFsUtils.isDirectory(rootDir) ||
            rootDir.getAbsoluteChildPath(remotePath.path) === undefined
        ) {
            return false;
        }

        return true;
    }

    static async from(
        client: ApiClient,
        wsfsDirUri: Uri,
        vscodeWorkspacePath: Uri
    ) {
        const wsfsDir = await SyncDestination.getWorkspaceFsDir(
            client,
            wsfsDirUri
        );
        if (wsfsDir === undefined) {
            return undefined;
        }
        return new SyncDestination(wsfsDir, wsfsDirUri, vscodeWorkspacePath);
    }

    static async getWorkspaceFsDir(client: ApiClient, wsfsDirUri: Uri) {
        assert.equal(wsfsDirUri.scheme, "wsfs");

        // Repo paths always start with "/Workspace" but the repos API strips this off.
        wsfsDirUri = SyncDestination.normalizeWorkspacePath(wsfsDirUri);

        const wsfsDir = await WorkspaceFsEntity.fromPath(
            client,
            wsfsDirUri.path.replace(/^\/Workspace\//, "/")
        );

        if (
            wsfsDir === undefined ||
            !["REPO", "DIRECTORY"].includes(wsfsDir.type)
        ) {
            return undefined;
        }

        return wsfsDir;
    }
    static normalizeWorkspacePath(workspacePath: string | Uri): Uri {
        if (typeof workspacePath === "string") {
            workspacePath = Uri.from({
                scheme: "wsfs",
                path: workspacePath,
            });
        }

        if (!workspacePath.path.startsWith("/Workspace/")) {
            workspacePath = Uri.from({
                scheme: "wsfs",
                path: `/Workspace${workspacePath.path}`,
            });
        }

        return workspacePath;
    }

    get type(): SyncDestinationType | undefined {
        switch (this.wsfsDir.type) {
            case "DIRECTORY":
                return "workspace";
            case "REPO":
                return "repo";
        }
    }

    get name(): string {
        return path.basename(this.wsfsDirPath.path);
    }

    get vscodeWorkspacePathName(): string {
        return path.basename(this.vscodeWorkspacePath.path);
    }

    get path(): Uri {
        return this.wsfsDirPath;
    }

    get relativeWsfsDirPath(): string {
        return this.wsfsDirPath.path.replace("/Workspace", "");
    }

    /**
     * Strips the workspace path from an absolute path
     */
    getRelativePath(path: Uri): string {
        if (path.scheme === "file") {
            if (!path.path.startsWith(this.vscodeWorkspacePath.path)) {
                throw new Error("local path is not within the workspace");
            }
            return path.path.replace(this.vscodeWorkspacePath.path, "");
        } else if (path.scheme === "wsfs") {
            return path.path.replace(this.wsfsDirPath.path, "");
        } else {
            throw new Error(`Invalid path scheme: ${path.scheme}`);
        }
    }

    /**
     * Maps a local notebook to notebook path used in workflow deifnitions.
     */
    localToRemoteNotebook(localPath: Uri): string {
        assert.equal(localPath.scheme, "file");
        return this.localToRemote(localPath).replace(
            /^\/Workspace(\/.*)\.(py|ipynb)/g,
            "$1"
        );
    }

    /**
     * Maps a local file path to the remote file path whre it gets synced to.
     */
    localToRemote(localPath: Uri): string {
        assert.equal(localPath.scheme, "file");
        if (!localPath.path.startsWith(this.vscodeWorkspacePath.path)) {
            throw new Error("local path is not within the workspace");
        }

        const relativePath = localPath.path.replace(
            this.vscodeWorkspacePath.path,
            ""
        );
        return Uri.joinPath(this.wsfsDirPath, relativePath).path;
    }

    remoteToLocal(remotePath: Uri): Uri {
        assert.equal(remotePath.scheme, "wsfs");
        if (!remotePath.path.startsWith(this.wsfsDirPath.path)) {
            throw new Error("remote path is not within the target wsfsDir");
        }

        const relativePath = remotePath.path.replace(this.wsfsDirPath.path, "");
        return Uri.joinPath(this.vscodeWorkspacePath, relativePath);
    }
}
