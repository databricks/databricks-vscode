import {Disposable, EventEmitter, Uri, workspace} from "vscode";
import {BundleFileSet, getAbsolutePath} from "./BundleFileSet";
import {WithMutex} from "../locking";
import path from "path";

export class BundleWatcher implements Disposable {
    private disposables: Disposable[] = [];

    private readonly _onDidChange = new EventEmitter<void>();
    public readonly onDidChange = this._onDidChange.event;

    private readonly _onDidChangeRootFile = new EventEmitter<void>();
    public readonly onDidChangeRootFile = this._onDidChangeRootFile.event;

    private readonly _onDidCreate = new EventEmitter<Uri>();
    public readonly onDidCreate = this._onDidCreate.event;

    private readonly _onDidDelete = new EventEmitter<Uri>();
    public readonly onDidDelete = this._onDidDelete.event;

    private bundleFileSet: WithMutex<BundleFileSet>;

    constructor(bundleFileSet: BundleFileSet, workspaceUri: Uri) {
        this.bundleFileSet = new WithMutex(bundleFileSet);
        const yamlWatcher = workspace.createFileSystemWatcher(
            getAbsolutePath(path.join("**", "*.{yaml,yml}"), workspaceUri)
                .fsPath
        );

        this.disposables.push(
            yamlWatcher,
            yamlWatcher.onDidCreate((e) => {
                this.yamlFileChangeHandler(e, "CREATE");
            }),
            yamlWatcher.onDidChange((e) => {
                this.yamlFileChangeHandler(e, "CHANGE");
            }),
            yamlWatcher.onDidDelete((e) => {
                this.yamlFileChangeHandler(e, "DELETE");
            })
        );
    }

    private async yamlFileChangeHandler(
        e: Uri,
        type: "CREATE" | "CHANGE" | "DELETE"
    ) {
        if (!(await this.bundleFileSet.value.isBundleFile(e))) {
            return;
        }

        this.bundleFileSet.value.bundleDataCache.invalidate();
        this._onDidChange.fire();
        // to provide additional granularity, we also fire an event when the root bundle file changes
        if (this.bundleFileSet.value.isRootBundleFile(e)) {
            this._onDidChangeRootFile.fire();
        }
        switch (type) {
            case "CREATE":
                this._onDidCreate.fire(e);
                break;
            case "DELETE":
                this._onDidDelete.fire(e);
                break;
        }
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
