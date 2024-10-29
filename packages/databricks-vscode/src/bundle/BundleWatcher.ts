import {Disposable, EventEmitter, Uri, workspace} from "vscode";
import {BundleFileSet, getAbsoluteGlobPath} from "./BundleFileSet";
import path from "path";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";

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

    private initCleanup: Disposable;
    constructor(
        private readonly bundleFileSet: BundleFileSet,
        private readonly workspaceFolderManager: WorkspaceFolderManager
    ) {
        this.initCleanup = this.init();
        this.disposables.push(
            this.workspaceFolderManager.onDidChangeActiveWorkspaceFolder(() => {
                this.initCleanup.dispose();
                this.initCleanup = this.init();
                this.bundleFileSet.bundleDataCache.invalidate();
            })
        );
    }

    private init() {
        const yamlWatcher = workspace.createFileSystemWatcher(
            getAbsoluteGlobPath(
                path.join("**", "*.{yaml,yml}"),
                this.workspaceFolderManager.activeWorkspaceFolder.uri
            )
        );

        const disposables: Disposable[] = [
            yamlWatcher,
            yamlWatcher.onDidCreate((e) => {
                this.yamlFileChangeHandler(e, "CREATE");
            }),
            yamlWatcher.onDidChange((e) => {
                this.yamlFileChangeHandler(e, "CHANGE");
            }),
            yamlWatcher.onDidDelete((e) => {
                this.yamlFileChangeHandler(e, "DELETE");
            }),
        ];

        return {
            dispose: () => {
                disposables.forEach((i) => i.dispose());
            },
        };
    }

    private async yamlFileChangeHandler(
        e: Uri,
        type: "CREATE" | "CHANGE" | "DELETE"
    ) {
        if (!(await this.bundleFileSet.isBundleFile(e))) {
            return;
        }

        this.bundleFileSet.bundleDataCache.invalidate();
        this._onDidChange.fire();
        // to provide additional granularity, we also fire an event when the root bundle file changes
        if (this.bundleFileSet.isRootBundleFile(e)) {
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
        this.initCleanup.dispose();
    }
}
