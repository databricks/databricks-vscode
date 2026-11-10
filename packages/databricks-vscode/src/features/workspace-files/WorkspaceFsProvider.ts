import { posix } from "node:path";
import {
    FileChangeType,
    FileSystemError,
    FileType,
    Uri,
    type Disposable,
    type Event,
    type FileChangeEvent,
    type FileStat,
    type FileSystemProvider,
} from "vscode";
import { Emitter } from "../../platform/event";
import { basename, isDirectory, isFile } from "./entries";
import type { WorkspaceFilesChange, WorkspaceFilesModel } from "./WorkspaceFilesModel";

/** The scheme of workspace files in editors, as before. */
export const WSFS_SCHEME = "databricks-wsfs";

export function wsfsUri(path: string): Uri {
    return Uri.from({ scheme: WSFS_SCHEME, path });
}

const CHANGE_TYPES = {
    created: FileChangeType.Created,
    changed: FileChangeType.Changed,
    deleted: FileChangeType.Deleted,
};

/**
 * `databricks-wsfs:` (WSFS-02): workspace files and notebooks open, and save,
 * in editors. Reads and writes go through the model, so they share its
 * short-lived cache. Creating directories, deleting and renaming are left to
 * the explorer's commands, as before.
 */
export class WorkspaceFsProvider implements FileSystemProvider, Disposable {
    private readonly changed = new Emitter<FileChangeEvent[]>();
    readonly onDidChangeFile: Event<FileChangeEvent[]> = this.changed.event;

    constructor(private readonly model: () => WorkspaceFilesModel | undefined) {}

    /** Forwards the model's changes; a refresh says nothing about single files. */
    modelChanged(change: WorkspaceFilesChange): void {
        if (change.kind !== "refreshed") {
            this.changed.fire([{ type: CHANGE_TYPES[change.kind], uri: wsfsUri(change.path) }]);
        }
    }

    async stat(uri: Uri): Promise<FileStat> {
        const entry = await this.requireModel().stat(uri.path);
        if (entry === undefined) {
            throw FileSystemError.FileNotFound(uri);
        }
        return {
            type: isDirectory(entry) ? FileType.Directory : FileType.File,
            ctime: entry.createdAt ?? 0,
            mtime: entry.modifiedAt ?? 0,
            size: entry.size ?? 0,
        };
    }

    async readDirectory(uri: Uri): Promise<[string, FileType][]> {
        const model = this.requireModel();
        const entry = await model.stat(uri.path);
        if (entry === undefined) {
            throw FileSystemError.FileNotFound(uri);
        }
        // The API lists a file as itself.
        if (!isDirectory(entry)) {
            throw FileSystemError.FileNotADirectory(uri);
        }
        const children = await model.list(entry.path);
        if (children === undefined) {
            throw FileSystemError.FileNotFound(uri);
        }
        return children.map((c) => [
            basename(c.path),
            isDirectory(c) ? FileType.Directory : FileType.File,
        ]);
    }

    async readFile(uri: Uri): Promise<Uint8Array> {
        const model = this.requireModel();
        const entry = await model.stat(uri.path);
        if (entry === undefined) {
            throw FileSystemError.FileNotFound(uri);
        }
        if (!isFile(entry)) {
            throw FileSystemError.FileIsADirectory(uri);
        }
        return model.read(entry.path);
    }

    async writeFile(
        uri: Uri,
        content: Uint8Array,
        options: { readonly create: boolean; readonly overwrite: boolean },
    ): Promise<void> {
        const model = this.requireModel();
        const parent = await model.stat(posix.dirname(uri.path));
        if (parent === undefined) {
            throw FileSystemError.FileNotFound(uri);
        }
        if (!isDirectory(parent)) {
            throw FileSystemError.NoPermissions(uri);
        }
        const existing = await model.stat(uri.path);
        if (existing === undefined && !options.create) {
            throw FileSystemError.FileNotFound(uri);
        }
        if (existing !== undefined && !options.overwrite) {
            throw FileSystemError.FileExists(uri);
        }
        if (isDirectory(existing)) {
            throw FileSystemError.FileIsADirectory(uri);
        }
        // The model fires the change, which `modelChanged` forwards.
        await model.write(uri.path, content, options.overwrite);
    }

    createDirectory(_uri: Uri): void {
        throw FileSystemError.NoPermissions("Use the Create Folder command to create directories");
    }

    delete(_uri: Uri, _options: { readonly recursive: boolean }): void {
        throw FileSystemError.NoPermissions("Use the Delete command to delete items");
    }

    rename(_oldUri: Uri, _newUri: Uri, _options: { readonly overwrite: boolean }): void {
        throw FileSystemError.NoPermissions("Rename is not supported");
    }

    /** Nothing to watch: the workspace sends no events. Changes made here are fired by the model. */
    watch(): Disposable {
        return { dispose: () => {} };
    }

    dispose(): void {
        this.changed.dispose();
    }

    private requireModel(): WorkspaceFilesModel {
        const model = this.model();
        if (model === undefined) {
            throw FileSystemError.Unavailable("Not connected to a Databricks workspace");
        }
        return model;
    }
}
