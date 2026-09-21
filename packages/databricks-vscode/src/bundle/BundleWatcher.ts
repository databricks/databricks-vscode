import {
    Disposable,
    EventEmitter,
    RelativePattern,
    Uri,
    workspace,
} from "vscode";
import {BundleFileSet, getAbsoluteGlobPath} from "./BundleFileSet";
import path from "path";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {Mutex} from "../locking";

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
    // Watchers for include files that resolve outside the active project root.
    // Tracked separately so they can be rebuilt when the include list changes
    // without tearing down the main in-tree watcher.
    private externalWatchersCleanup: Disposable | undefined;
    // Serializes refreshExternalWatchers() so overlapping invocations (e.g. a
    // burst of root-file changes) don't leak watchers or create duplicates.
    private readonly externalWatchersMutex = new Mutex();
    constructor(
        private readonly bundleFileSet: BundleFileSet,
        private readonly workspaceFolderManager: WorkspaceFolderManager
    ) {
        this.initCleanup = this.init();
        void this.refreshExternalWatchers();
        this.disposables.push(
            this.workspaceFolderManager.onDidChangeActiveProjectFolder(() => {
                this.initCleanup.dispose();
                this.initCleanup = this.init();
                void this.refreshExternalWatchers();
                this.bundleFileSet.bundleDataCache.invalidate();
            })
        );
    }

    private init() {
        const yamlWatcher = workspace.createFileSystemWatcher(
            getAbsoluteGlobPath(
                path.join("**", "*.{yaml,yml}"),
                this.workspaceFolderManager.activeProjectUri
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

    /**
     * (Re)create watchers for include files that live outside the active
     * project root. The default recursive watcher created in init() only
     * observes files under the project root, so parent-folder includes
     * (e.g. "../../shared/databricks-shared.yml") need dedicated watchers
     * to keep the bundle cache and downstream models in sync.
     */
    private async refreshExternalWatchers() {
        return this.externalWatchersMutex.synchronise(async () => {
            this.externalWatchersCleanup?.dispose();
            this.externalWatchersCleanup = undefined;

            const targets =
                await this.bundleFileSet.getExternalIncludeWatchTargets();
            if (targets.length === 0) {
                return;
            }

            const disposables: Disposable[] = [];
            for (const {baseUri, pattern} of targets) {
                const watcher = workspace.createFileSystemWatcher(
                    new RelativePattern(baseUri, pattern)
                );
                disposables.push(
                    watcher,
                    watcher.onDidCreate((e) => {
                        this.yamlFileChangeHandler(e, "CREATE");
                    }),
                    watcher.onDidChange((e) => {
                        this.yamlFileChangeHandler(e, "CHANGE");
                    }),
                    watcher.onDidDelete((e) => {
                        this.yamlFileChangeHandler(e, "DELETE");
                    })
                );
            }

            this.externalWatchersCleanup = {
                dispose: () => {
                    disposables.forEach((i) => i.dispose());
                },
            };
        });
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
            // The include list lives in the root file, so its set of external
            // include locations may have changed. Rebuild those watchers.
            void this.refreshExternalWatchers();
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
        this.externalWatchersCleanup?.dispose();
    }
}
