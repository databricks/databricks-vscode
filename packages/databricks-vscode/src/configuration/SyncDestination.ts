import {ApiClient, Repo} from "@databricks/databricks-sdk";
import * as assert from "assert";
import path = require("path");
import {Uri} from "vscode";

type SyncDestinationType = "workspace" | "repo";

/**
 * Either Databricks repo or workspace that acts as a sync target for the current workspace.
 */
export class SyncDestination {
    /**
     * ONLY USE FOR TESTING
     */
    constructor(
        readonly repo: Repo,
        readonly repoPath: Uri,
        readonly vscodeWorkspacePath: Uri
    ) {}

    static async from(
        client: ApiClient,
        repoUri: Uri,
        vscodeWorkspacePath: Uri
    ) {
        assert.equal(repoUri.scheme, "wsfs");

        // Repo paths always start with "/Workspace" but the repos API strips this off.
        if (!repoUri.path.startsWith("/Workspace/")) {
            repoUri = Uri.from({
                scheme: "wsfs",
                path: `/Workspace${repoUri.path}`,
            });
        }

        const repo = await Repo.fromPath(
            client,
            repoUri.path.replace("/Workspace", "")
        );
        return new SyncDestination(repo, repoUri, vscodeWorkspacePath);
    }

    get type(): SyncDestinationType {
        return "repo";
    }

    get name(): string {
        return path.basename(this.repoPath.path);
    }

    get vscodeWorkspacePathName(): string {
        return path.basename(this.vscodeWorkspacePath.path);
    }

    get path(): Uri {
        return this.repoPath;
    }

    get relativeRepoPath(): string {
        return this.repoPath.path.replace("/Workspace", "");
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
            return path.path.replace(this.repoPath.path, "");
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
     * Maps a local file path to the remote directory containing the file.
     */
    localToRemoteDir(localPath: Uri): string {
        assert.equal(localPath.scheme, "file");
        return path.dirname(this.localToRemote(localPath));
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
        return Uri.joinPath(this.repoPath, relativePath).path;
    }

    remoteToLocal(remotePath: Uri): Uri {
        assert.equal(remotePath.scheme, "wsfs");
        if (!remotePath.path.startsWith(this.repoPath.path)) {
            throw new Error("remote path is not within the target repo");
        }

        const relativePath = remotePath.path.replace(this.repoPath.path, "");
        return Uri.joinPath(this.vscodeWorkspacePath, relativePath);
    }
}
