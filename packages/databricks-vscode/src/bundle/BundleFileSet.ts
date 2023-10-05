import {
    Disposable,
    EventEmitter,
    FileSystemWatcher,
    RelativePattern,
    Uri,
    workspace,
} from "vscode";
import * as glob from "glob";
import {merge} from "lodash";
import * as yaml from "yaml";
import path from "path";
import {BundleSchema} from "./BundleSchema";
import {readFile} from "fs/promises";
import {CachedValue} from "../utils/CachedValue";

export async function parseBundleYaml(file: Uri) {
    const data = yaml.parse(await readFile(file.fsPath, "utf-8"));
    return data as BundleSchema;
}

export class BundleFileSet implements Disposable {
    private disposables: Disposable[] = [];

    private includedFilesGlob?: string;
    private rootFilePattern: string;

    private _onDidChangeIncludedFilesList = new EventEmitter<void>();
    private _onDidChangeMergedBundle = new EventEmitter<void>();
    private _onDidChangeRootFile = new EventEmitter<Uri | undefined>();

    public readonly onDidChangeIncludedFilesList =
        this._onDidChangeIncludedFilesList.event;
    public readonly onDidChangeMergedBundle =
        this._onDidChangeMergedBundle.event;
    private readonly onDidChangeRootFile = this._onDidChangeRootFile.event;

    private includedFilesWatcher?: FileSystemWatcher;

    private _mergedBundle: CachedValue<BundleSchema> =
        new CachedValue<BundleSchema>(async () => {
            let bundle = {};
            await this.forEach(async (data) => {
                bundle = merge(bundle, data);
            });
            return bundle as BundleSchema;
        });

    constructor(public rootFile?: Uri) {
        this.rootFilePattern = path.join(
            rootFile.fsPath,
            "{bundle,databricks}.{yaml,yml}"
        );
        const rootWatcher = workspace.createFileSystemWatcher(
            this.rootFilePattern
        );
        this.disposables.push(
            rootWatcher,
            rootWatcher.onDidCreate((e) => {
                this.rootFile = e;
                this._onDidChangeRootFile.fire(e);
            }),
            rootWatcher.onDidDelete((e) => {
                if (this.rootFile?.fsPath === e.fsPath) {
                    this.rootFile = undefined;
                    this._onDidChangeRootFile.fire(undefined);
                }
            }),
            rootWatcher.onDidChange(async (e) => {
                this._onDidChangeRootFile.fire(e);
            }),
            this.onDidChangeIncludedFilesList(() => {
                if (this.includedFilesGlob === undefined) {
                    return;
                }

                this.includedFilesWatcher?.dispose();
                this.includedFilesWatcher = workspace.createFileSystemWatcher(
                    new RelativePattern(rootFile, this.includedFilesGlob)
                );
                this.disposables.push(
                    this.includedFilesWatcher,
                    this.includedFilesWatcher.onDidCreate(() => {
                        this.invalidateMergedBundleCache();
                    }),
                    this.includedFilesWatcher.onDidChange(() => {
                        this.invalidateMergedBundleCache();
                    }),
                    this.includedFilesWatcher.onDidDelete(() => {
                        this.invalidateMergedBundleCache();
                    })
                );
                this.invalidateMergedBundleCache();
            }),
            this.onDidChangeRootFile(async (e) => {
                await this.updateIncludeFiles(e);
                this.invalidateMergedBundleCache();
            }),
            this.onDidChangeMergedBundle(() => {
                if (this._mergedBundle) {
                    this._mergedBundle.dirty = true;
                }
            })
        );
    }

    async invalidateMergedBundleCache() {
        if (this._mergedBundle) {
            this._mergedBundle.dirty = true;
        }
        this._onDidChangeMergedBundle.fire();
    }

    async init() {
        const files = await glob.glob(this.rootFilePattern);
        this.rootFile = Uri.file(files[0]);
        await this.updateIncludeFiles(this.rootFile);
        this.invalidateMergedBundleCache();
    }

    async getIncludedFilesGlob() {
        if (this.rootFile === undefined) {
            return;
        }

        const bundle = await parseBundleYaml(this.rootFile);
        const includedFilesGlob =
            bundle?.include === undefined || bundle?.include.length === 0
                ? undefined
                : `{${bundle.include?.join(",")}}`;

        return includedFilesGlob;
    }
    async getIncludedFiles(workspaceRoot: Uri) {
        const includedFilesGlob = await this.getIncludedFilesGlob();
        if (includedFilesGlob !== undefined) {
            return (
                await glob.glob(
                    path.join(workspaceRoot.fsPath, includedFilesGlob)
                )
            ).map((i) => Uri.file(i));
        }
    }

    async allFiles() {
        if (this.rootFile === undefined) {
            return [];
        }

        return [
            this.rootFile,
            ...(
                await glob.glob(
                    path.join(
                        this.rootFile.fsPath,
                        this.includedFilesGlob ?? ""
                    )
                )
            ).map((i) => Uri.file(i)),
        ];
    }

    async findFileWithPredicate(predicate: (file: Uri) => Promise<boolean>) {
        const matchedFiles = [];
        for await (const file of this) {
            if (await predicate(file)) {
                matchedFiles.push(file);
            }
        }
        return matchedFiles;
    }

    async forEach(f: (data: BundleSchema, file: Uri) => Promise<void>) {
        for await (const file of this) {
            await f(await parseBundleYaml(file), file);
        }
    }

    get mergedBundle() {
        if (this._mergedBundle !== undefined && !this._mergedBundle.dirty) {
            return this._mergedBundle.bundle;
        }

        return (async () => {
            let bundle = {};
            this.forEach(async (data) => {
                bundle = merge(bundle, data);
            });
            this._mergedBundle = {
                dirty: false,
                bundle: bundle as BundleSchema,
            };
            return this._mergedBundle.bundle;
        })();
    }

    async *[Symbol.asyncIterator]() {
        yield* await this.allFiles();
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
