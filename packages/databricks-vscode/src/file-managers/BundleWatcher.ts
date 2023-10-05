import {Disposable, EventEmitter, Uri, workspace} from "vscode";
import {BundleFileSet} from "../bundle/BundleFileSet";
import {WithMutex} from "../locking";
import path from "path";

export class BundleWatcher implements Disposable {
    private disposables: Disposable[] = [];

    private readonly _onDidChange = new EventEmitter<BundleFileSet>();
    public readonly onDidChange = this._onDidChange.event;

    private bundleFileSet = new WithMutex(
        new BundleFileSet(this.workspaceRoot)
    );

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
        // eslint-disable-next-line no-console
        console.error("asdad");
        await this.bundleFileSet.mutex.wait();
        try {
            if (await this.bundleFileSet.value.isBundleFile(e)) {
                await this.bundleFileSet.value.invalidateMergedBundleCache();
                this._onDidChange.fire(this.bundleFileSet.value);
            }
        } finally {
            this.bundleFileSet.mutex.signal();
        }
        return;
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
