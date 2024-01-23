import {Uri} from "vscode";
import * as glob from "glob";
import {merge} from "lodash";
import * as yaml from "yaml";
import path from "path";
import {BundleSchema} from "./BundleSchema";
import {readFile, writeFile} from "fs/promises";
import {CachedValue} from "../locking/CachedValue";
import minimatch from "minimatch";

export async function parseBundleYaml(file: Uri) {
    const data = yaml.parse(await readFile(file.fsPath, "utf-8"));
    return data as BundleSchema;
}

export async function writeBundleYaml(file: Uri, data: BundleSchema) {
    await writeFile(file.fsPath, yaml.stringify(data));
}

function toGlobPath(path: string) {
    if (process.platform === "win32") {
        return path.replace(/\\/g, "/");
    }
    return path;
}
export class BundleFileSet {
    private rootFilePattern: string = "{bundle,databricks}.{yaml,yml}";
    private subProjectFilePattern: string = `**/${this.rootFilePattern}`;

    public readonly bundleDataCache: CachedValue<BundleSchema> =
        new CachedValue<BundleSchema>(async () => {
            let bundle = {};
            await this.forEach(async (data) => {
                bundle = merge(bundle, data);
            });
            return bundle as BundleSchema;
        });

    constructor(private readonly workspaceRoot: Uri) {}

    getAbsolutePath(path: string | Uri, root?: Uri) {
        if (typeof path === "string") {
            return Uri.joinPath(root ?? this.workspaceRoot, path);
        }
        return Uri.joinPath(root ?? this.workspaceRoot, path.fsPath);
    }

    async getRootFile() {
        const rootFile = await glob.glob(
            toGlobPath(this.getAbsolutePath(this.rootFilePattern).fsPath),
            {nocase: process.platform === "win32"}
        );
        if (rootFile.length !== 1) {
            return undefined;
        }
        return Uri.file(rootFile[0]);
    }

    async getSubProjects(root?: Uri): Promise<{relative: Uri; absolute: Uri}[]> {
        const subProjectRoots = await glob.glob(
            toGlobPath(this.getAbsolutePath(this.subProjectFilePattern, root).fsPath),
            {nocase: process.platform === "win32"}
        );
        const normalizedRoot = path.normalize(root?.fsPath ?? this.workspaceRoot.fsPath);
        return subProjectRoots.map((rootFile) => {
            const dirname = path.dirname(path.normalize(rootFile));
            const absolute = Uri.file(dirname);
            const relative = Uri.file(
                absolute.fsPath.replace(this.workspaceRoot.fsPath, "")
            );
            return {absolute, relative};
        }).filter(({absolute}) => {
            return absolute.fsPath !== normalizedRoot;
        });
    }

    async getIncludedFilesGlob() {
        const rootFile = await this.getRootFile();
        if (rootFile === undefined) {
            return undefined;
        }
        const bundle = await parseBundleYaml(Uri.file(rootFile.fsPath));
        if (bundle?.include === undefined || bundle?.include.length === 0) {
            return undefined;
        }
        if (bundle?.include.length === 1) {
            return bundle.include[0];
        }
        return `{${bundle.include.join(",")}}`;
    }

    async getIncludedFiles() {
        const includedFilesGlob = await this.getIncludedFilesGlob();
        if (includedFilesGlob !== undefined) {
            return (
                await glob.glob(
                    toGlobPath(
                        path.join(this.workspaceRoot.fsPath, includedFilesGlob)
                    ),
                    {nocase: process.platform === "win32"}
                )
            ).map((i) => Uri.file(i));
        }
    }

    async allFiles() {
        const rootFile = await this.getRootFile();
        if (rootFile === undefined) {
            return [];
        }

        return [rootFile, ...((await this.getIncludedFiles()) ?? [])];
    }

    async findFile(
        predicate: (data: BundleSchema, file: Uri) => Promise<boolean>
    ) {
        const matchedFiles: {data: BundleSchema; file: Uri}[] = [];
        this.forEach(async (data, file) => {
            if (await predicate(data, file)) {
                matchedFiles.push({data, file});
            }
        });
        return matchedFiles;
    }

    async forEach(f: (data: BundleSchema, file: Uri) => Promise<void>) {
        for (const file of await this.allFiles()) {
            await f(await parseBundleYaml(file), file);
        }
    }

    isRootBundleFile(e: Uri) {
        return minimatch(
            e.fsPath,
            toGlobPath(this.getAbsolutePath(this.rootFilePattern).fsPath)
        );
    }

    async isIncludedBundleFile(e: Uri) {
        let includedFilesGlob = await this.getIncludedFilesGlob();
        if (includedFilesGlob === undefined) {
            return false;
        }
        includedFilesGlob = this.getAbsolutePath(includedFilesGlob).fsPath;
        return minimatch(e.fsPath, toGlobPath(includedFilesGlob));
    }

    async isBundleFile(e: Uri) {
        return this.isRootBundleFile(e) || (await this.isIncludedBundleFile(e));
    }
}
