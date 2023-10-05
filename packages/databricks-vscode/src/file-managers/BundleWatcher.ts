import {
    Disposable,
    EventEmitter,
    FileSystemWatcher,
    Uri,
    workspace,
} from "vscode";
import {BundleFileSet} from "../bundle/BundleFileSet";
import {Mutex, WithMutex} from "../locking";
import path from "path";
import { minimatch } from "minimatch";

export class BundleWatcher implements Disposable {
    private disposables: Disposable[] = [];

    private readonly rootFilePattern = "{bundle,databricks}.{yaml,yml}";
    private readonly _onDidChange = new EventEmitter<BundleFileSet>();

    private bundleFileSet = new WithMutex(new BundleFileSet());

    getAbsolutePath(path: string | Uri) {
        if (typeof path === "string") {
            return Uri.joinPath(this.workspaceRoot, path);
        }
        return Uri.joinPath(this.workspaceRoot, path.fsPath);
    }

    constructor(private readonly workspaceRoot: Uri) {
        const yamlWatcher = workspace.createFileSystemWatcher(
            this.getAbsolutePath(path.join("**", "*.yaml")).fsPath
        )

        this.disposables.push(
            yamlWatcher, 
            yamlWatcher.onDidCreate(this.yamlFileCreateHandler), 
            yamlWatcher.onDidCreate(this.yamlFileChangeHandler), 
            yamlWatcher.onDidCreate(this.yamlFileDeleteHandler)
        )
    }

    isRootBundleFile(e: Uri) {
        return minimatch.match([e.fsPath], this.rootFilePattern).length !== 0;
    }

    async isIncludedBundleFile(e: Uri) {
        let includedFilesGlob =  await this.bundleFileSet.getIncludedFilesGlob();
        if(includedFilesGlob === undefined) {
            return false;
        }
        includedFilesGlob = this.getAbsolutePath(includedFilesGlob).fsPath
        return minimatch.match([e.fsPath], includedFilesGlob).length !== 0;
    }

    async isBundleFile(e: Uri) {
        return this.isRootBundleFile(e) || this.isIncludedBundleFile(e);
    }

    async yamlFileCreateHandler(e: Uri) {
        await this.bundleFileSet.mutex.wait();
        try{
            if(this.isRootBundleFile(e)) {
                this.bundleFileSet.value = new BundleFileSet(e);
            }
            if(await this.isIncludedBundleFile(e) || this.isRootBundleFile(e)) {
                this._onDidChange.fire(this.bundleFileSet.value)
            }
        } finally {
            this.bundleFileSet.mutex.signal();
        }
    }


    async yamlFileChangeHandler(e: Uri) {
        if(this.isBundleFile(e)) {
            
        }
        return;
    }

    rootFileWatchers() {
        const watcher = workspace.createFileSystemWatcher(
            this.getAbsolutePath(this.rootFilePattern).fsPath
        );

        const listener = (e: Uri) => {
            this.updateIncludedFilesWatcher(e);
        };

        this.disposables.push(
            watcher,
            watcher.onDidCreate(listener),
            watcher.onDidChange(listener),
            watcher.onDidDelete(listener)
        );
    }

    async updateIncludedFilesWatcher(rootFile: Uri) {
        if (this.bundleFileSet.rootFile?.fsPath !== rootFile.fsPath) {
            await this.mutex.wait();
            this.bundleFileSet.rootFile = rootFile;
            this.mutex.signal();
        }

        const includedFilesGlob =
            await this.bundleFileSet.getIncludedFilesGlob();

        if (this.includedFiles.glob === includedFilesGlob) {
            return;
        }

        if (includedFilesGlob === undefined) {
            await this.mutex.wait();

            this.includedFiles.glob = undefined;
            this.includedFiles._onDidChange.fire(undefined);

            this.mutex.signal();
            return;
        }

        await this.mutex.wait();
        try {
            this.includedFiles.watcher?.dispose();
            this.includedFiles.watcher = workspace.createFileSystemWatcher(
                this.getAbsolutePath(includedFilesGlob).fsPath
            );

            this.
        } catch (e) {
        } finally {
        }
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
