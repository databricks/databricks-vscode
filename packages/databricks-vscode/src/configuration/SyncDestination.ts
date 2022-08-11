import path = require("path");
import {Uri} from "vscode";

type SyncDestinationType = "workspace" | "repo";

/**
 * Either Databricks repo or workspace that acts as a sync target for the current workspace.
 */
export class SyncDestination {
    private repoPath: Uri;

    constructor(repoPath: Uri, readonly vscodeWorkspacePath: Uri) {
        this.repoPath = repoPath;

        // Repo paths always start with "/Workspace" but the repos API strips this off.
        if (!this.repoPath.path.startsWith("/Workspace/")) {
            this.repoPath = Uri.file(`/Workspace${this.repoPath.path}`);
        }
    }

    get type(): SyncDestinationType {
        return "repo";
    }

    get name(): string {
        return path.basename(this.repoPath.path);
    }

    get path(): Uri {
        return this.repoPath;
    }

    /**
     * Maps a local notebook to notebook path used in workflow deifnitions.
     */
    localToRemoteNotebook(localPath: Uri): string {
        return this.localToRemote(localPath).replace(
            /^\/Workspace(\/.*).py/g,
            "$1"
        );
    }

    /**
     * Maps a local file path to the remote directory containing the file.
     */
    localToRemoteDir(localPath: Uri): string {
        return path.dirname(this.localToRemote(localPath));
    }

    /**
     * Maps a local file path to the remote file path whre it gets synced to.
     */
    localToRemote(localPath: Uri): string {
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
