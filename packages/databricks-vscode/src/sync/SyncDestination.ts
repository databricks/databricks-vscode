import {
    WorkspaceClient,
    WorkspaceFsEntity,
    WorkspaceFsUtils,
} from "@databricks/databricks-sdk";
import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import path = require("path");
import {Uri} from "vscode";
import {Loggers} from "../logger";
import {ConnectionManager} from "../configuration/ConnectionManager";

export const REPO_NAME_SUFFIX = ".ide";
export type SyncDestinationType = "repo" | "workspace";

export abstract class DatabricksUri<T> {
    constructor(readonly uri: Uri) {}

    abstract get name(): string;
    abstract get path(): string;

    abstract relativePath(other: T): string;

    hasChild(other: T) {
        const relative = this.relativePath(other);
        if (!relative.startsWith("..")) {
            return true;
        }

        return false;
    }
}
export class RemoteUri extends DatabricksUri<RemoteUri> {
    constructor(uri: Uri | string) {
        if (typeof uri === "string") {
            uri = Uri.from({
                scheme: "wsfs",
                path: uri,
            });
        } else if (uri.scheme !== "wsfs") {
            const err = new Error(
                `Remote file URI scheme must be wsfs. Found ${uri.scheme} (${uri.path})`
            );
            NamedLogger.getOrCreate(Loggers.Extension).error(err.message, err);
            throw err;
        }

        if (uri.path.startsWith("/Workspace/")) {
            uri = Uri.from({
                scheme: "wsfs",
                path: uri.path.replace("/Workspace", ""),
            });
        }
        super(uri);
    }

    async validate(connectionManager: ConnectionManager) {
        const remotePath = this.uri.path;

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
            rootDir.getAbsoluteChildPath(remotePath) === undefined
        ) {
            return false;
        }

        return true;
    }

    get name(): string {
        const base = path.posix.basename(this.path);
        if (base.endsWith(REPO_NAME_SUFFIX)) {
            return base.slice(0, -REPO_NAME_SUFFIX.length);
        } else {
            return base;
        }
    }

    get path(): string {
        return this.uri.path;
    }

    get workspacePrefixPath(): string {
        return path.posix.join("/Workspace", this.path);
    }

    get localPath(): string {
        return this.uri.fsPath;
    }

    relativePath(other: RemoteUri) {
        return path.posix.relative(this.path, other.path);
    }

    async getUrl(wsClient: WorkspaceClient): Promise<string | undefined> {
        return await (
            await WorkspaceFsEntity.fromPath(wsClient, this.uri.path)
        )?.url;
    }

    get type(): SyncDestinationType {
        if (this.path.startsWith("/Repos")) {
            return "repo";
        } else {
            return "workspace";
        }
    }
}

export class LocalUri extends DatabricksUri<LocalUri> {
    constructor(uri: Uri | string) {
        if (typeof uri === "string") {
            uri = Uri.file(uri);
        } else if (uri.scheme !== "file") {
            const err = new Error(
                `Local file URI scheme must be file. Found ${uri.scheme} (${uri.fsPath})`
            );
            NamedLogger.getOrCreate(Loggers.Extension).error(err.message, err);
            throw err;
        }

        super(Uri.file(uri.fsPath));
    }

    get name(): string {
        return path.basename(this.path);
    }

    get path(): string {
        return this.uri.fsPath;
    }

    get posixPath(): string {
        return this.uri.path;
    }

    relativePath(other: LocalUri) {
        return path.relative(this.path, other.path);
    }
}

export class SyncDestinationMapper {
    constructor(
        readonly localUri: LocalUri,
        readonly remoteUri: RemoteUri
    ) {}
    /**
     * Maps a local notebook to notebook path used in workflow deifnitions.
     */
    localToRemoteNotebook(localPath: LocalUri): RemoteUri {
        return new RemoteUri(
            this.localToRemote(localPath).path.replace(
                /^(\/.*)\.(py|ipynb|scala|r|sql)/g,
                "$1"
            )
        );
    }
    /**
     * Maps a local file path to the remote file path whre it gets synced to.
     */
    localToRemote(localPath: LocalUri): RemoteUri {
        if (
            localPath.path !== this.localUri.path &&
            !this.localUri.hasChild(localPath)
        ) {
            throw new Error(
                `local path is not within the workspace. Expected ${localPath.path} to start with ${this.localUri.path}.`
            );
        }

        const relativePath = path.posix.relative(
            this.localUri.posixPath,
            localPath.posixPath
        );
        return new RemoteUri(
            path.posix.join(this.remoteUri.path, relativePath)
        );
    }

    remoteToLocal(remotePath: RemoteUri): LocalUri {
        if (
            this.remoteUri.path !== remotePath.path &&
            !this.remoteUri.hasChild(remotePath)
        ) {
            throw new Error(
                `remote path is not within the target remote dir. Expected ${remotePath.path} to start with ${this.remoteUri.path}`
            );
        }

        const relative = path.relative(
            this.remoteUri.localPath,
            remotePath.localPath
        );
        return new LocalUri(path.join(this.localUri.path, relative));
    }
}
