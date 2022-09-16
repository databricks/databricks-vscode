import * as assert from "assert";
import path = require("path");
import {Uri} from "vscode";

type SyncDestinationType = "workspace" | "repo" | "dbfs";

/**
 * Either Databricks repo or workspace that acts as a sync target for the current workspace.
 */
export class SyncDestination {
    private repoPath: Uri;

    constructor(repoPath: Uri, readonly vscodeWorkspacePath: Uri) {
        assert.ok(["dbws", "dbfs"].includes(repoPath.scheme));

        this.repoPath = repoPath;

        // Repo paths always start with "/Workspace" but the repos API strips this off.
        if (
            !this.repoPath.path.startsWith("/Workspace/") &&
            this.repoPath.scheme !== "dbfs"
        ) {
            this.repoPath = Uri.from({
                scheme: this.repoPath.scheme,
                path: `/Workspace${this.repoPath.path}`,
            });
        }
    }

    get type(): SyncDestinationType {
        return this.repoPath.scheme === "dbfs" ? "dbfs" : "repo";
    }

    get name(): string {
        return path.basename(this.repoPath.path);
    }

    get path(): Uri {
        return this.repoPath;
    }

    get remotePath(): string {
        return this.type === "dbfs"
            ? `/dbfs${this.path.path}`
            : this.repoPath.path;
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
        } else if (["dbfs", "dbws"].includes(path.scheme)) {
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
            /^\/Workspace(\/.*).py/g,
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

        let relativePath = localPath.path.replace(
            this.vscodeWorkspacePath.path,
            ""
        );
        return Uri.joinPath(this.repoPath, relativePath).path;
    }
}
