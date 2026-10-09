import {Uri} from "vscode";
import * as glob from "glob";
import {mergeWith} from "lodash";
import * as yaml from "yaml";
import path from "path";
import {BundleSchema} from "./types";
import {readFile, writeFile} from "fs/promises";
import {CachedValue} from "../locking/CachedValue";
import {minimatch} from "minimatch";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";

const rootFilePattern: string = "{bundle,databricks}.{yaml,yml}";
const subProjectFilePattern: string = path.join("**", rootFilePattern);

/** The root bundle file names (the expansion of {@link rootFilePattern}). */
const rootFileNames = [
    "databricks.yml",
    "databricks.yaml",
    "bundle.yml",
    "bundle.yaml",
];

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

/**
 * Merge bundle data the way the CLI does. `lodash.merge` lets a later `null`
 * (`~`) overwrite an earlier value; the CLI's dynamic-value merge keeps the
 * earlier value when the new one is null. Without this an include that sets
 * `workspace: ~` would blank a host the guard then reads as absent (→ allow),
 * while the CLI keeps and uses the real host. Everything non-null merges as
 * before (recursively; last non-null wins).
 *
 * Note: this only *keeps* an earlier value; when there is no earlier value a
 * later null still writes through (lodash's customizer can't leave a key unset).
 * That's fine for the host/profile the guard reads, where a null and an absent
 * value both mean "unset" — but don't rely on null-vs-absent for other fields.
 */
export function mergeBundleData<T extends object>(
    target: T,
    ...sources: unknown[]
): T {
    return mergeWith(
        target,
        ...sources,
        (objValue: unknown, srcValue: unknown) =>
            srcValue === null ? objValue : undefined
    );
}

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
    // `yaml.parse` threw on a syntax error; `parseDocument` collects them in
    // `doc.errors` and `toJS` still returns partial data. Keep failing closed on
    // a broken file (the guard reads this) rather than resolving a half-parsed
    // bundle.
    if (doc.errors.length > 0) {
        throw doc.errors[0];
    }
    yaml.visit(doc, {
        // yaml's visitor API keys on the capitalised node type.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Pair(_, pair) {
            // Identify a merge key by its parsed value (the merge symbol), not by
            // its source text: `<<` and an explicitly tagged `!!merge foo` are
            // both merge keys, and both must be reordered to the CLI's last-wins.
            if (
                yaml.isScalar(pair.key) &&
                typeof pair.key.value === "symbol" &&
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
        let bundle: object = {};
        await this.forEach(async (data) => {
            bundle = mergeBundleData(bundle, data);
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

        const projectRoot = this.projectRoot.fsPath;
        const relativeKey = (file: string) =>
            toGlobPath(path.relative(projectRoot, file));

        const allFiles: string[] = [];
        for (const pattern of patterns) {
            const absolutePattern = toGlobPath(
                path.resolve(projectRoot, pattern)
            );
            const files = await glob.glob(absolutePattern, {
                nocase: process.platform === "win32",
                // Match the CLI's Go glob so the remote-mode credential guard
                // reads the same include files (and the same workspace.host)
                // the CLI resolves, rather than sending the session token to a
                // host it never checked.
                ...goGlobOptions,
            });
            // The CLI marks the root bundle files (databricks.yml etc.) as loaded
            // before expanding `include`, so it never re-loads one as an include.
            // node-glob has no such filter: an include like `*.yml` matches the
            // root file, and allFiles() merges it again last, letting its values
            // win over the includes'. Drop them to match the CLI.
            const includes = files.filter((f) => !this.isRootInclude(f));
            // The CLI sorts each pattern's matches by their path relative to the
            // bundle root (Go's slices.Sort, byte-wise) and lets the last file
            // win on merge. Sort by that same key — not the absolute path, whose
            // leading segments can reorder matches that reach outside the root
            // via `../` — so a contested host resolves to the same file here.
            includes.sort((a, b) => {
                const ra = relativeKey(a);
                const rb = relativeKey(b);
                return ra < rb ? -1 : ra > rb ? 1 : 0;
            });
            allFiles.push(...includes);
        }

        // Keep the first occurrence of each file, so a file matched by more
        // than one pattern stays in the position its earliest pattern gave it.
        return [...new Set(allFiles)].map((f) => Uri.file(f));
    }

    /**
     * Whether an absolute path is a root bundle file at the project root
     * (`databricks.yml`/`.yaml`, `bundle.yml`/`.yaml`) — the files the CLI
     * excludes from `include` expansion.
     */
    private isRootInclude(absFile: string): boolean {
        const rel = path.relative(this.projectRoot.fsPath, absFile);
        const normalised =
            process.platform === "win32" ? rel.toLowerCase() : rel;
        return rootFileNames.includes(normalised);
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
     * True if any `include` pattern uses a `[…]` character class. Go's
     * `filepath.Match` reads several classes differently from minimatch/glob —
     * `[!x]` is literal `!`/`x` in Go but a negation here, and Go has no POSIX
     * classes so `[[:alpha:]]` is a literal set there but "one letter" here. The
     * cases are hard to enumerate, so rather than reproduce each one we treat any
     * `[` as unreliable: `getIncludedFiles` can't be trusted to match the CLI, so
     * the remote-mode credential guard fails closed instead of resolving a host
     * from a possibly-different file set.
     */
    async hasUnsupportedGlobClass(): Promise<boolean> {
        const patterns = await this.getIncludePatterns();
        return patterns.some((pattern) => pattern.includes("["));
    }
}
