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

/**
 * Glob/minimatch options that make node-glob resolve a bundle `include` pattern
 * the way the CLI's Go `filepath.Glob` does, so the remote-mode credential
 * guard builds the same merged bundle (and resolves the same `workspace.host`)
 * the CLI will. Go's glob matches dotfiles with `*` (`dot`), and has no `**`
 * (`noglobstar`), no brace expansion (`nobrace`) and no extglobs (`noext`) — so
 * e.g. `conf/**` only reaches one directory deep. `getIncludedFiles` and
 * `isIncludedBundleFile` must use the same set, or an edit to an included file
 * could be classified differently from the way that file is actually loaded.
 */
const goGlobOptions = {
    dot: true,
    noglobstar: true,
    nobrace: true,
    noext: true,
} as const;

export async function parseBundleYaml(file: Uri) {
    const yamlOptions = {
        // Bundles might have a lot of aliases (#1706), default 100 limit is too low
        maxAliasCount: -1,
        // Apply `<<` merge keys like the CLI's Go yaml does. Without this the JS
        // parser (YAML 1.2) treats `<<` as an ordinary key, so a target that
        // merges its workspace block via `<<` would resolve to a different host
        // here than in the CLI — which the remote-mode credential guard relies
        // on reading correctly.
        merge: true,
    };
    // Parse to a document (not straight to JS) so we can fix one remaining
    // divergence from the CLI's Go yaml: a *sequence* merge key `<<: [*a, *b]`.
    // The JS parser follows the YAML 1.1 spec (earlier maps in the sequence win),
    // but the CLI's loader merges each map in order so the *last* map wins. Left
    // alone, a target could resolve to a different host here than in the CLI,
    // letting the guard allow a token the CLI would send elsewhere. Reversing the
    // sequence before converting to JS makes the merge order match the CLI. A
    // scalar `<<: *a` has no order to disagree on and is untouched.
    const doc = yaml.parseDocument(
        await readFile(file.fsPath, "utf-8"),
        yamlOptions
    );
    yaml.visit(doc, {
        // yaml's visitor API keys on the capitalised node type.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Pair(_, pair) {
            if (
                yaml.isScalar(pair.key) &&
                pair.key.source === "<<" &&
                yaml.isSeq(pair.value)
            ) {
                pair.value.items.reverse();
            }
        },
    });
    return doc.toJS(yamlOptions) as BundleSchema;
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
        new CachedValue<BundleSchema>(() => this.readMergedBundleFromDisk());

    /**
     * Reads and merges every bundle file fresh from disk, bypassing
     * bundleDataCache. The remote-mode credential guard reads the target host
     * through this (via BundlePreValidateModel), so a missed BundleWatcher
     * event — an inotify limit, a `files.watcherExclude` entry, or the race
     * between `git pull` writing a file and the event arriving — can't leave it
     * approving a host that no longer matches the YAML on disk.
     */
    async readMergedBundleFromDisk(): Promise<BundleSchema> {
        let bundle = {};
        await this.forEach(async (data) => {
            bundle = merge(bundle, data);
        });
        return bundle as BundleSchema;
    }

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
                // Match the CLI's Go glob so the remote-mode credential guard
                // reads the same include files (and the same workspace.host)
                // the CLI resolves, rather than sending the session token to a
                // host it never checked.
                ...goGlobOptions,
            });
            // The CLI sorts each pattern's matches (Go's sort.Strings, a
            // byte-wise comparison) and lets the last file win on merge. Match
            // that order exactly — plain `<`/`>`, not localeCompare — so a host
            // split across e.g. `targets/a.yml` and `targets/z.yml` resolves to
            // the same file here as in the CLI. node-glob doesn't sort, so its
            // order is filesystem-dependent.
            files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
            allFiles.push(...files);
        }

        // Keep the first occurrence of each file, so a file matched by more
        // than one pattern stays in the position its earliest pattern gave it.
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
            // Use the same Go-glob options as getIncludedFiles so an edit is
            // recognised as a bundle-file change exactly when that file is one
            // the CLI (and getIncludedFiles) would load.
            if (
                minimatch(toGlobPath(e.fsPath), absolutePattern, goGlobOptions)
            ) {
                return true;
            }
        }
        return false;
    }

    async isBundleFile(e: Uri) {
        return this.isRootBundleFile(e) || (await this.isIncludedBundleFile(e));
    }

    /**
     * True if any `include` pattern uses a `[!…]` character class. Go's
     * `filepath.Match` treats `[!x]` as the literal characters `!` and `x` (only
     * `[^x]` negates), while minimatch/glob negate `[!…]`. So the two can load
     * different files, and `getIncludedFiles` here can't be trusted to match the
     * CLI. The remote-mode credential guard uses this to fail closed rather than
     * resolve a host from a file set that may differ from the CLI's.
     */
    async hasNegatedGlobClass(): Promise<boolean> {
        const patterns = await this.getIncludePatterns();
        return patterns.some((pattern) => pattern.includes("[!"));
    }
}
