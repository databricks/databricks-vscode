import {posix} from "path";
import {
    Disposable,
    EventEmitter,
    FileChangeEvent,
    FileChangeType,
    FileStat,
    FileSystemError,
    FileSystemProvider,
    FileType,
    Uri,
} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {WorkspaceFsEntity} from "../sdk-extensions/wsfs/WorkspaceFsEntity";
import {WorkspaceFsFile} from "../sdk-extensions/wsfs/WorkspaceFsFile";

export class WorkspaceFsFileSystemProvider
    implements FileSystemProvider, Disposable
{
    private _onDidChangeFile = new EventEmitter<FileChangeEvent[]>();
    readonly onDidChangeFile = this._onDidChangeFile.event;

    constructor(private readonly connectionManager: ConnectionManager) {}

    private requireClient() {
        const client = this.connectionManager.workspaceClient;
        if (!client) {
            throw FileSystemError.Unavailable(
                "Not connected to a Databricks workspace"
            );
        }
        return client;
    }

    async stat(uri: Uri): Promise<FileStat> {
        const client = this.requireClient();
        const entity = await WorkspaceFsEntity.fromPath(client, uri.path);
        if (!entity) {
            throw FileSystemError.FileNotFound(uri);
        }
        const isDir =
            entity.type === "DIRECTORY" || entity.type === "REPO";
        return {
            type: isDir ? FileType.Directory : FileType.File,
            ctime: entity.details.created_at ?? 0,
            mtime: entity.details.modified_at ?? 0,
            size: 0,
        };
    }

    async readFile(uri: Uri): Promise<Uint8Array> {
        const client = this.requireClient();
        const entity = await WorkspaceFsEntity.fromPath(client, uri.path);
        if (!entity) {
            throw FileSystemError.FileNotFound(uri);
        }
        if (!(entity instanceof WorkspaceFsFile)) {
            throw FileSystemError.NoPermissions(uri);
        }
        return entity.readContent();
    }

    async writeFile(
        uri: Uri,
        content: Uint8Array,
        options: {create: boolean; overwrite: boolean}
    ): Promise<void> {
        const client = this.requireClient();
        const {WorkspaceFsDir} = await import(
            "../sdk-extensions/wsfs/WorkspaceFsDir"
        );

        // Resolve parent directory — works for both existing and new files.
        const parentPath = posix.dirname(uri.path);
        const parentEntity = await WorkspaceFsEntity.fromPath(
            client,
            parentPath
        );
        if (!parentEntity) {
            throw FileSystemError.FileNotFound(uri);
        }
        if (!(parentEntity instanceof WorkspaceFsDir)) {
            throw FileSystemError.NoPermissions(uri);
        }

        // If the file doesn't exist and create is not requested, reject.
        const existing = await WorkspaceFsEntity.fromPath(client, uri.path);
        if (!existing && !options.create) {
            throw FileSystemError.FileNotFound(uri);
        }

        await parentEntity.createFile(posix.basename(uri.path), content, true);
        this.notifyChanged(uri);
    }

    async readDirectory(uri: Uri): Promise<[string, FileType][]> {
        const client = this.requireClient();
        const entity = await WorkspaceFsEntity.fromPath(client, uri.path);
        if (!entity) {
            throw FileSystemError.FileNotFound(uri);
        }
        const children = await entity.children;
        return children.map((child) => {
            const isDir =
                child.type === "DIRECTORY" || child.type === "REPO";
            return [child.basename, isDir ? FileType.Directory : FileType.File];
        });
    }

    createDirectory(_uri: Uri): void {
        throw FileSystemError.NoPermissions(
            "Use the Create Folder command to create directories"
        );
    }

    delete(_uri: Uri, _options: {recursive: boolean}): void {
        throw FileSystemError.NoPermissions(
            "Use the Delete command to delete items"
        );
    }

    rename(_oldUri: Uri, _newUri: Uri, _options: {overwrite: boolean}): void {
        throw FileSystemError.NoPermissions("Rename is not supported");
    }

    watch(_uri: Uri): Disposable {
        return new Disposable(() => {});
    }

    notifyChanged(uri: Uri) {
        this._onDidChangeFile.fire([{type: FileChangeType.Changed, uri}]);
    }

    notifyCreated(uri: Uri) {
        this._onDidChangeFile.fire([{type: FileChangeType.Created, uri}]);
    }

    notifyDeleted(uri: Uri) {
        this._onDidChangeFile.fire([{type: FileChangeType.Deleted, uri}]);
    }

    dispose() {
        this._onDidChangeFile.dispose();
    }
}
