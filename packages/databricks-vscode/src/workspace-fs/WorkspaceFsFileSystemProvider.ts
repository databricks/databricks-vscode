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
            ctime: 0,
            mtime: 0,
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
        _options: {create: boolean; overwrite: boolean}
    ): Promise<void> {
        const client = this.requireClient();
        const entity = await WorkspaceFsEntity.fromPath(client, uri.path);
        if (!entity) {
            throw FileSystemError.FileNotFound(uri);
        }
        const parent = await entity.parent;
        if (!parent) {
            throw FileSystemError.FileNotFound(uri);
        }
        const {WorkspaceFsDir} = await import(
            "../sdk-extensions/wsfs/WorkspaceFsDir"
        );
        if (!(parent instanceof WorkspaceFsDir)) {
            throw FileSystemError.NoPermissions(uri);
        }
        await parent.createFile(
            entity.basename,
            Buffer.from(content).toString(),
            true
        );
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
