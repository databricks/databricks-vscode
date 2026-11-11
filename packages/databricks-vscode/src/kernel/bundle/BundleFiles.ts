import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { glob } from "tinyglobby";
import * as yaml from "yaml";
import { Emitter, disposeAll, type Disposable, type Event } from "../../platform/event";
import type { FileEvents } from "../../platform/fileEvents";
import { includePatterns } from "./LocalBundleConfig";

/**
 * The files of one bundle: the root file and the files its `include` globs
 * name. Ported from the old `BundleFileSet` and `BundleWatcher`.
 */

/** The root file names, in any case on Windows (`{bundle,databricks}.{yaml,yml}`). */
export const ROOT_FILE_NAMES = ["databricks.yml", "databricks.yaml", "bundle.yml", "bundle.yaml"];

/** How long a burst of file events is coalesced before reloading. */
export const BUNDLE_DEBOUNCE_MS = 500;

const caseInsensitive = process.platform === "win32";

export interface BundleFilesSnapshot {
    readonly root: string;
    /** Undefined when the folder has no root file, or more than one. */
    readonly rootFile?: string;
    /** The root file, then the included files in the order of their patterns. */
    readonly files: readonly string[];
    /** The parsed YAML of `files`, in the same order. */
    readonly documents: readonly unknown[];
    /** Files that failed to read or parse, with the error. */
    readonly errors: readonly { readonly file: string; readonly message: string }[];
}

/** The root bundle file directly in `root`, if there is exactly one. */
export async function findRootFile(root: string): Promise<string | undefined> {
    let names: string[];
    try {
        names = await readdir(root);
    } catch {
        return undefined;
    }
    const wanted = (name: string) =>
        ROOT_FILE_NAMES.includes(caseInsensitive ? name.toLowerCase() : name);
    const matches = names.filter(wanted);
    return matches.length === 1 ? path.join(root, matches[0]!) : undefined;
}

export function parseBundleYaml(content: string): unknown {
    // Bundles may use many aliases (#1706); the default limit of 100 is too low.
    return yaml.parse(content, { maxAliasCount: -1 });
}

/** Reads and parses the bundle rooted in `root`. Never throws for bad files. */
export async function readBundleFiles(root: string): Promise<BundleFilesSnapshot> {
    const rootFile = await findRootFile(root);
    if (rootFile === undefined) {
        return { root, files: [], documents: [], errors: [] };
    }
    const errors: { file: string; message: string }[] = [];
    const parse = async (file: string): Promise<unknown> => {
        try {
            return parseBundleYaml(await readFile(file, "utf-8"));
        } catch (e) {
            errors.push({ file, message: e instanceof Error ? e.message : String(e) });
            return undefined;
        }
    };
    const rootDocument = await parse(rootFile);
    const included: string[] = [];
    for (const pattern of includePatterns(rootDocument)) {
        // One pattern at a time, so later patterns win when the files merge.
        const matches = await glob(pattern, {
            cwd: root,
            absolute: true,
            caseSensitiveMatch: !caseInsensitive,
        });
        for (const file of matches.map((f) => path.normalize(f)).sort()) {
            if (file !== rootFile && !included.includes(file)) {
                included.push(file);
            }
        }
    }
    const documents = [rootDocument];
    for (const file of included) {
        documents.push(await parse(file));
    }
    return { root, rootFile, files: [rootFile, ...included], documents, errors };
}

const globMagic = /[*?{}[\]!+@()]/;

/**
 * Splits an absolute glob into its static base directory and the rest, for
 * example `/a/b/**\/*.yml` into `/a/b` and `**\/*.yml`. A path without magic
 * characters is a literal file: its directory is the base.
 */
export function splitGlobBase(absolute: string): { base: string; pattern: string } {
    const segments = absolute.split(/[\\/]/);
    let i = 0;
    while (i < segments.length && !globMagic.test(segments[i]!)) {
        i++;
    }
    const staticCount = i === segments.length ? segments.length - 1 : i;
    const base = segments.slice(0, staticCount).join(path.sep) || path.sep;
    return { base, pattern: segments.slice(staticCount).join("/") };
}

/**
 * Where the include patterns point outside `root`, for example
 * `../shared/*.yml`. The watcher on the root doesn't see those files.
 */
export function externalWatchTargets(
    root: string,
    patterns: readonly string[],
): { base: string; pattern: string }[] {
    const targets = new Map<string, { base: string; pattern: string }>();
    for (const pattern of patterns) {
        const target = splitGlobBase(path.resolve(root, pattern));
        if (path.relative(root, target.base).startsWith("..")) {
            targets.set(`${target.base}\0${target.pattern}`, target);
        }
    }
    return [...targets.values()];
}

/**
 * Watches one bundle's YAML files, under the root and wherever its includes
 * point, and fires `onDidChange` once per burst of events (500 ms). It doesn't
 * filter events by the include globs: a reload is cheap, and the reader
 * compares the result.
 */
export class BundleFiles implements Disposable {
    private readonly changed = new Emitter<void>();
    readonly onDidChange: Event<void> = this.changed.event;
    private readonly watchers: Disposable[] = [];
    private external: Disposable[] = [];
    private externalKey = "";
    private timer?: ReturnType<typeof setTimeout>;

    constructor(
        readonly root: string,
        private readonly files: FileEvents,
        private readonly debounceMs = BUNDLE_DEBOUNCE_MS,
    ) {
        this.watchers.push(this.files.watch(root, "**/*.{yaml,yml}", () => this.schedule()));
    }

    /** Reads the bundle, and starts watching the include locations outside the root. */
    async read(): Promise<BundleFilesSnapshot> {
        const snapshot = await readBundleFiles(this.root);
        this.watchExternal(externalWatchTargets(this.root, includePatterns(snapshot.documents[0])));
        return snapshot;
    }

    private watchExternal(targets: { base: string; pattern: string }[]) {
        const key = JSON.stringify(targets);
        if (key === this.externalKey) {
            return;
        }
        disposeAll(this.external);
        this.externalKey = key;
        this.external = targets.map((t) =>
            this.files.watch(t.base, t.pattern, () => this.schedule()),
        );
    }

    private schedule() {
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.changed.fire();
        }, this.debounceMs);
    }

    dispose(): void {
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
        }
        disposeAll(this.watchers);
        disposeAll(this.external);
        this.changed.dispose();
    }
}
