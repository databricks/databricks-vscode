import {Disposable, EventEmitter, Uri, workspace} from "vscode";
import {BundleFileSet} from "../bundle/BundleFileSet";
import {WithMutex} from "../locking";
import path from "path";

export class BundleWatcher implements Disposable {
    private disposables: Disposable[] = [];

    private readonly _onDidChange = new EventEmitter<void>();
    public readonly onDidChange = this._onDidChange.event;

    private readonly _onDidChangeRootFile = new EventEmitter<void>();
    public readonly onDidChangeRootFile = this._onDidChangeRootFile.event;

    private bundleFileSet: WithMutex<BundleFileSet>;

    constructor(
        private readonly workspaceRoot: Uri,
        bundleFileSet: BundleFileSet
    ) {
        this.bundleFileSet = new WithMutex(bundleFileSet);
        const yamlWatcher = workspace.createFileSystemWatcher(
            this.bundleFileSet.value.getAbsolutePath(
                path.join("**", "*.{yaml,yml}")
            ).fsPath
        );

        this.disposables.push(
            yamlWatcher,
            yamlWatcher.onDidCreate(this.yamlFileChangeHandler, this),
            yamlWatcher.onDidChange(this.yamlFileChangeHandler, this),
            yamlWatcher.onDidDelete(this.yamlFileChangeHandler, this)
        );
    }

    private async yamlFileChangeHandler(e: Uri) {
        if (await this.bundleFileSet.value.isBundleFile(e)) {
            await this.bundleFileSet.value.invalidateMergedBundleCache();
            this._onDidChange.fire();
        }
        // to provide additional granularity, we also fire an event when the root bundle file changes
        if (this.bundleFileSet.value.isRootBundleFile(e)) {
            this._onDidChangeRootFile.fire();
        }
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
