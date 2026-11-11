import path from "node:path";
import type { ValidatedBundle } from "./BundleService";

/**
 * Where the bundle's files are, locally and in the workspace: the project's
 * root and validate's `workspace.file_path`, which is where `bundle sync`
 * and `bundle deploy` upload them. Derived from the validated bundle, so it
 * changes whenever validate's output does. Replaces the old
 * `SyncDestinationMapper`, without its Repos-era parts (`.ide` repo names,
 * `/Repos` destinations).
 */
export interface SyncDestination {
    readonly localRoot: string;
    /** As validate prints it, usually starting with `/Workspace`. */
    readonly remoteRoot: string;
}

export function syncDestination(
    validated: ValidatedBundle | undefined,
): SyncDestination | undefined {
    const remoteRoot = validated?.config.workspace?.file_path;
    return validated === undefined || remoteRoot === undefined
        ? undefined
        : { localRoot: validated.root, remoteRoot };
}

/** `/Workspace/Users/me` and `/Users/me` name the same folder; the old `RemoteUri` dropped the prefix. */
function stripWorkspacePrefix(remotePath: string): string {
    return remotePath.replace(/^\/Workspace(?=\/)/, "").replace(/\/+$/, "");
}

/** The path with the `/Workspace` prefix, as code running on a cluster sees the file (the old `workspacePrefixPath`). */
export function workspacePath(remotePath: string): string {
    const stripped = stripWorkspacePrefix(remotePath);
    return stripped === "" ? "/Workspace" : `/Workspace${stripped}`;
}

/** A local file's path in the workspace, without the `/Workspace` prefix. Throws for a file outside the project. */
export function localToRemote(localPath: string, destination: SyncDestination): string {
    const relative = path.relative(destination.localRoot, localPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(
            `local path is not within the workspace. Expected ${localPath} to start with ${destination.localRoot}.`,
        );
    }
    return path.posix.join(
        stripWorkspacePrefix(destination.remoteRoot),
        ...relative.split(path.sep).filter(Boolean),
    );
}

/** Notebooks lose their extension in the workspace: `src/nb.py` → `…/src/nb`. */
export function localToRemoteNotebook(localPath: string, destination: SyncDestination): string {
    return localToRemote(localPath, destination).replace(/^(\/.*)\.(py|ipynb|scala|r|sql)$/, "$1");
}

/** `/Workspace/Users/me/.bundle/p/dev/files/src/nb` → `<root>/src/nb`. Undefined outside the bundle's files. */
export function remoteToLocal(
    remotePath: string,
    destination: SyncDestination,
): string | undefined {
    const remote = stripWorkspacePrefix(remotePath);
    const root = stripWorkspacePrefix(destination.remoteRoot);
    if (remote !== root && !remote.startsWith(`${root}/`)) {
        return undefined;
    }
    return path.join(
        destination.localRoot,
        ...remote.slice(root.length).split("/").filter(Boolean),
    );
}
