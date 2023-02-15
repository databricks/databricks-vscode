import {
    WorkspaceClient,
    WorkspaceFsEntity,
    WorkspaceFsUtils,
} from "@databricks/databricks-sdk";
import {NamedLogger} from "@databricks/databricks-sdk/src/logging";
import * as assert from "assert";
import path = require("path");
import {Uri} from "vscode";
import {Loggers} from "../logger";
import {ConnectionManager} from "./ConnectionManager";

type SyncDestinationType = "workspace" | "repo";
export const REPO_NAME_SUFFIX = ".ide";

class RemoteUri {
    readonly wsfsDirPath: Uri;

    constructor(wsfsDirPath: Uri) {
        this.wsfsDirPath = SyncDestination.normalizeWorkspacePath(wsfsDirPath);
    }
}

class LocalUri {
    constructor(readonly localDirPath: Uri) {
        if (localDirPath.scheme !== "file") {
            const err = new Error(
                `Local file URI scheme must be file. Found ${localDirPath.scheme} (${localDirPath.fsPath})`
            );
            NamedLogger.getOrCreate(Loggers.Extension).error(err.message, err);
            throw err;
        }
    }
}
/**
 * Either Databricks repo or workspace that acts as a sync target for the current workspace.
 */
export class SyncDestination {
    readonly wsfsDirPath: Uri;
    /**
     * ONLY USE FOR TESTING
     */
    constructor(wsfsDirPath: Uri, readonly vscodeWorkspacePath: Uri) {
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
            connectionManager.workspaceClient,
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
        client: WorkspaceClient,
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
        return new SyncDestination(wsfsDirUri, vscodeWorkspacePath);
    }

    static async getWorkspaceFsDir(client: WorkspaceClient, wsfsDirUri: Uri) {
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

    get name(): string {
        const base = path.basename(this.wsfsDirPath.path);
        if (base.endsWith(REPO_NAME_SUFFIX)) {
            return base.slice(0, -REPO_NAME_SUFFIX.length);
        } else {
            return base;
        }
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
                throw new Error(
                    `local path is not within the workspace. Expected ${path.path} to start with ${this.vscodeWorkspacePath.path}.`
                );
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
            /^\/Workspace(\/.*)\.(py|ipynb|scala|r|sql)/g,
            "$1"
        );
    }

    /**
     * Maps a local file path to the remote file path whre it gets synced to.
     */
    localToRemote(localPath: Uri): string {
        assert.equal(localPath.scheme, "file");
        if (!localPath.path.startsWith(this.vscodeWorkspacePath.path)) {
            throw new Error(
                `local path is not within the workspace. Expected ${localPath.path} to start with ${this.vscodeWorkspacePath.path}.`
            );
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
