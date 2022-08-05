import path = require("path");
import {Uri} from "vscode";

/**
 * Class that maps paths between the local file system to the file systems
 * on the Databricks driver
 */
export class PathMapper {
    constructor(readonly repoPath: Uri, readonly workspacePath: Uri) {}

    localToRemoteDir(localPath: Uri): string {
        return path.dirname(this.localToRemote(localPath));
    }

    localToRemote(localPath: Uri): string {
        let relativePath = localPath.path.replace(this.workspacePath.path, "");
        return Uri.joinPath(this.repoPath, relativePath).path;
    }

    get remoteWorkspaceName(): string {
        return path.basename(this.repoPath.path);
    }
}
