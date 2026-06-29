import {Uri} from "vscode";
import * as glob from "glob";
import {merge} from "lodash";
import * as yaml from "yaml";
import path from "path";
import {BundleSchema} from "./types";
import {readFile, writeFile} from "fs/promises";
import {CachedValue} from "../locking/CachedValue";
import {minimatch} from "minimatch";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";

const rootFilePattern: string = "{bundle,databricks}.{yaml,yml}";
const subProjectFilePattern: string = path.join("**", rootFilePattern);

export async function parseBundleYaml(file: Uri) {
    const data = yaml.parse(await readFile(file.fsPath, "utf-8"), {
        // Bundles might have a lot of aliases (#1706), default 100 limit is too low
        maxAliasCount: -1,
    });
    return data as BundleSchema;
}

export async function writeBundleYaml(file: Uri, data: BundleSchema) {
    await writeFile(file.fsPath, yaml.stringify(data));
}

export async function getSubProjects(root: Uri) {
    const subProjectRoots = await glob.glob(
        getAbsoluteGlobPath(subProjectFilePattern, root),
        {nocase: process.platform === "win32"}
    );
    const normalizedRoot = path.normalize(root.fsPath);
    return subProjectRoots
        .map((rootFile) => {
            const dirname = path.dirname(path.normalize(rootFile));
            const absolute = Uri.file(dirname);
            const relative = path.relative(normalizedRoot, dirname);
            return {absolute, relative};
        })
        .filter(({absolute}) => {
            return absolute.fsPath !== normalizedRoot;
        });
}

export function getAbsoluteGlobPath(path: string | Uri, root: Uri): string {
    path = typeof path === "string" ? path : path.fsPath;
    const uri = Uri.joinPath(root, path);
    return toGlobPath(uri.fsPath);
}

function toGlobPath(path: string) {
    if (process.platform === "win32") {
        return path.replace(/\\/g, "/");
    }
    return path;
}

const globMagicChars = /[*?{}[\]!+@()]/;

/**
 * Splits an absolute glob path into its static base directory (the leading
 * segments that contain no glob magic characters) and the remaining glob
 * pattern. e.g. "/a/b/sub/**\/*.yml" -> {base: "/a/b/sub", pattern: "**\/*.yml"}.
 * A pattern without any magic characters is treated as a literal file: its
 * directory becomes the base and its filename the pattern.
 */
function splitGlobBase(absolutePath: string): {base: string; pattern: string} {
    const segments = absolutePath.split(path.sep);
    const staticSegments: string[] = [];
    let i = 0;
    for (; i < segments.length; i++) {
        if (globMagicChars.test(segments[i])) {
            break;
        }
        staticSegments.push(segments[i]);
    }
    // If no segment contains magic chars, treat the path as a literal file and
    // use its parent directory as the base.
    if (i === segments.length) {
        staticSegments.pop();
    }
    const base = staticSegments.join(path.sep) || path.sep;
    const pattern = segments.slice(staticSegments.length).join("/");
    return {base, pattern};
}

export class BundleFileSet {
    public readonly bundleDataCache: CachedValue<BundleSchema> =
        new CachedValue<BundleSchema>(async () => {
            let bundle = {};
            await this.forEach(async (data) => {
                bundle = merge(bundle, data);
            });
            return bundle as BundleSchema;
        });

    private get projectRoot() {
        return this.workspaceFolderManager.activeProjectUri;
    }

    constructor(
        private readonly workspaceFolderManager: WorkspaceFolderManager
    ) {
        workspaceFolderManager.onDidChangeActiveProjectFolder(() => {
            this.bundleDataCache.invalidate();
        });
    }

    async getRootFile() {
        const rootFile = await glob.glob(
            getAbsoluteGlobPath(rootFilePattern, this.projectRoot),
            {nocase: process.platform === "win32"}
        );
        if (rootFile.length !== 1) {
            return undefined;
        }
        return Uri.file(rootFile[0]);
    }

    private async getIncludePatterns(): Promise<string[]> {
        const rootFile = await this.getRootFile();
        if (rootFile === undefined) {
            return [];
        }
        const bundle = await parseBundleYaml(rootFile);
        if (!bundle?.include?.length) {
            return [];
        }
        return bundle.include;
    }

    async getIncludedFiles() {
        const patterns = await this.getIncludePatterns();
        if (patterns.length === 0) {
            return undefined;
        }

        const allFiles: string[] = [];
        for (const pattern of patterns) {
            const absolutePattern = toGlobPath(
                path.resolve(this.projectRoot.fsPath, pattern)
            );
            const files = await glob.glob(absolutePattern, {
                nocase: process.platform === "win32",
            });
            allFiles.push(...files);
        }

        return [...new Set(allFiles)].map((f) => Uri.file(f));
    }

    /**
     * Returns watch targets for include patterns whose static base resolves
     * outside the active project root (e.g. "../../shared/*.yml"). The default
     * recursive workspace watcher only observes files under the project root,
     * so these external bases need dedicated watchers. Each target is a base
     * directory plus a relative glob suitable for a vscode RelativePattern.
     */
    async getExternalIncludeWatchTargets(): Promise<
        {baseUri: Uri; pattern: string}[]
    > {
        const patterns = await this.getIncludePatterns();
        const projectRoot = path.normalize(this.projectRoot.fsPath);
        const targets = new Map<string, {baseUri: Uri; pattern: string}>();

        for (const pattern of patterns) {
            const resolved = path.resolve(projectRoot, pattern);
            const {base, pattern: relativePattern} = splitGlobBase(resolved);
            // Keep only bases that escape the project root. The default
            // recursive watcher already covers everything under the root.
            const relativeToRoot = path.relative(projectRoot, base);
            if (!relativeToRoot.startsWith("..")) {
                continue;
            }
            const key = `${base}\0${relativePattern}`;
            if (!targets.has(key)) {
                targets.set(key, {
                    baseUri: Uri.file(base),
                    pattern: relativePattern,
                });
            }
        }

        return [...targets.values()];
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
            getAbsoluteGlobPath(rootFilePattern, this.projectRoot)
        );
    }

    async isIncludedBundleFile(e: Uri) {
        const patterns = await this.getIncludePatterns();
        for (const pattern of patterns) {
            const absolutePattern = toGlobPath(
                path.resolve(this.projectRoot.fsPath, pattern)
            );
            if (minimatch(toGlobPath(e.fsPath), absolutePattern)) {
                return true;
            }
        }
        return false;
    }

    async isBundleFile(e: Uri) {
        return this.isRootBundleFile(e) || (await this.isIncludedBundleFile(e));
    }
}
