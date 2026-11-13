import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { disposeAll, type Disposable } from "../../platform/event";
import type { Logger } from "../../platform/log";
import { MutableState, Resource, select, type State } from "../../platform/reactive";
import { stateKey, type StateStore } from "../../platform/state";
import type { FileEvents } from "../../platform/fileEvents";
import type { FileSearch } from "../../platform/fileSearch";
import {
    BUNDLE_DEBOUNCE_MS,
    BundleFiles,
    readBundleFiles,
    ROOT_FILE_NAMES,
} from "../bundle/BundleFiles";
import { localBundleConfig, type LocalBundleConfig } from "../bundle/LocalBundleConfig";
import {
    OVERRIDES_GLOB,
    TargetFiles,
    VARIABLES_GLOB,
    type Overrides,
    type VariableOverrides,
} from "./TargetFiles";

/** The project folder the user picked, kept with its old name. */
export const ACTIVE_PROJECT_PATH = stateKey<string | undefined>(
    "databricks.activeProjectPath",
    "workspace",
    undefined,
);

/** The chosen target of each project, keyed by project root. */
export const PROJECT_TARGETS = stateKey<Record<string, string>>(
    "databricks.project.targets",
    "workspace",
    {},
);

/**
 * The old one-per-window target key. Read as a fallback, never written or
 * removed, so switching back to the old extension loses nothing.
 */
export const LEGACY_TARGET = stateKey<string | undefined>(
    "databricks.bundle.target",
    "workspace",
    undefined,
);

/** A detected bundle project: a folder with a root bundle file. */
export interface Project {
    readonly root: string;
    readonly rootFile: string;
    /** The root file, then the included files (BNDL-04). */
    readonly files: readonly string[];
    readonly config: LocalBundleConfig;
}

/** A folder below the active one that holds a root bundle file. */
export interface SubProject {
    readonly absolute: string;
    /** Relative to the folder searched, as the project picker shows it. */
    readonly relative: string;
}

/** Everything one detection pass found, published together. */
export interface ProjectSnapshot {
    /** The active project folder, whether or not it holds a bundle. */
    readonly root?: string;
    readonly project?: Project;
    readonly target?: string;
    /** The active target's `vscode.overrides.json`. */
    readonly overrides?: Overrides;
    /** The active target's `vscode.bundlevars.json` (BNDL-13). */
    readonly variables?: VariableOverrides;
    /**
     * Changes whenever the content of any bundle file does, even where the
     * local config doesn't change (a job's tasks). `bundle validate` reruns on it.
     */
    readonly revision?: string;
    /** Only searched when `root` holds no bundle. */
    readonly subProjects: readonly SubProject[];
}

export interface ProjectServiceDeps {
    /** The workspace folders' paths, in order. */
    readonly folders: State<readonly string[]>;
    readonly files: FileEvents;
    /** Searches for sub-projects. */
    readonly search: FileSearch;
    readonly state: StateStore;
    readonly log: Logger;
    /** How long file events are coalesced. */
    readonly debounceMs?: number;
}

const EMPTY: ProjectSnapshot = { subProjects: [] };

/**
 * Folders not searched for sub-projects: dot-folders, such as `.git`,
 * `.databricks` and `.venv`, and `node_modules`.
 */
const EXCLUDED = "**/{.*,node_modules}/**";

/**
 * Root bundle files at any depth. The search matches case-sensitively, but
 * Windows and macOS file systems usually don't, so there each letter matches
 * either case.
 */
function subProjectPattern(): string {
    const names = `{${ROOT_FILE_NAMES.join(",")}}`;
    const caseless = process.platform === "win32" || process.platform === "darwin";
    return `**/${caseless ? names.replace(/[a-z]/g, (c) => `[${c}${c.toUpperCase()}]`) : names}`;
}

/**
 * Resolves links in a path. A path that is gone, such as a folder deleted
 * since the search, is returned as it is.
 */
function realPath(p: string): Promise<string> {
    return realpath(p).catch(() => p);
}

/**
 * Whether no folder on the way from the root is a link, which would change
 * the folder's real path.
 */
function isReachedDirectly(realFolder: string, realRoot: string, relative: string): boolean {
    return realFolder === path.join(realRoot, relative);
}

/**
 * Owns the active project, its target and the target's files. Every
 * input (folders, bundle files, overrides files, the user's picks) triggers
 * one detection pass, which publishes its results together, so readers never
 * see a target from one pass and overrides from another. Replaces the old
 * `WorkspaceFolderManager` and the detection part of `BundleProjectManager`.
 */
export class ProjectService implements Disposable {
    private readonly detection: Resource<ProjectSnapshot>;
    private readonly current = new MutableState<
        ProjectSnapshot & { readonly initialized: boolean }
    >({
        ...EMPTY,
        initialized: false,
    });

    /** The last detection pass. The states below are parts of it. */
    readonly snapshot: State<ProjectSnapshot & { readonly initialized: boolean }> = this.current;
    /** False until the first detection pass ends: the "Initializing…" welcome. */
    readonly initialized = select(this.current, (s) => s.initialized);
    readonly root = select(this.current, (s) => s.root);
    /** No folder, or no root bundle file: undefined. */
    readonly active = select(this.current, (s) => s.project);
    readonly target = select(this.current, (s) => s.target);
    readonly overrides = select(this.current, (s) => s.overrides);
    readonly variables = select(this.current, (s) => s.variables);
    readonly subProjects = select(this.current, (s) => s.subProjects);

    private watched?: { root: string; bundle: BundleFiles; targetFiles: Disposable[] };
    private readonly disposables: Disposable[] = [];
    private timer?: ReturnType<typeof setTimeout>;
    private started = false;

    constructor(private readonly deps: ProjectServiceDeps) {
        this.detection = new Resource((signal) => this.detect(signal));
        this.disposables.push(
            this.detection.onDidChange((s) => {
                if (s.status === "ready") {
                    const prev = this.current.value;
                    const next = s.value;
                    if (
                        prev.root !== next.root ||
                        prev.project?.rootFile !== next.project?.rootFile ||
                        prev.target !== next.target
                    ) {
                        this.deps.log.info(
                            next.project !== undefined
                                ? `Project ${next.project.rootFile}, target ${next.target ?? "(none)"}`
                                : `No bundle project in ${next.root ?? "(no folder)"}`,
                        );
                    }
                    // Unchanged parts keep their identity, so sessions bound to
                    // the project don't restart when only the overrides change.
                    this.current.set({
                        ...next,
                        project: keep(prev.project, next.project),
                        overrides: keep(prev.overrides, next.overrides),
                        variables: keep(prev.variables, next.variables),
                        subProjects: keep(prev.subProjects, next.subProjects),
                        initialized: true,
                    });
                } else if (s.status === "error") {
                    this.deps.log.error("Project detection failed", s.error);
                    this.current.set({ ...this.current.value, initialized: true });
                }
            }),
        );
    }

    /** Starts detecting. Call from `start`, not while registering. */
    start(): void {
        if (this.started) {
            return;
        }
        this.started = true;
        this.disposables.push(
            this.deps.folders.onDidChange(() => this.detection.invalidate("folders changed")),
        );
        this.detection.invalidate("start");
    }

    /** The files of the active project, or undefined without one. */
    get targetFiles(): TargetFiles | undefined {
        const project = this.active.value;
        return project === undefined ? undefined : new TargetFiles(project.root);
    }

    /** Resolves once the pending detection pass, if any, has published. */
    async settled(): Promise<void> {
        await this.detection.settled();
    }

    /** Makes `root` the active project folder, and remembers it. */
    async selectProject(root: string): Promise<void> {
        await this.deps.state.set(ACTIVE_PROJECT_PATH, path.normalize(root));
        await this.redetect("project selected");
    }

    /** Makes `name` the active project's target, and remembers it per project. */
    async selectTarget(name: string): Promise<void> {
        const project = this.active.value;
        if (project === undefined) {
            throw new Error("No Databricks project is open");
        }
        if (!project.config.targets.some((t) => t.name === name)) {
            throw new Error(`The bundle has no target '${name}'`);
        }
        const targets = this.deps.state.get(PROJECT_TARGETS);
        await this.deps.state.set(PROJECT_TARGETS, { ...targets, [project.root]: name });
        await this.redetect("target selected");
    }

    /**
     * Writes one key of the active target's overrides. The change is visible
     * in `overrides` when this resolves; it doesn't wait for the watcher.
     */
    async saveOverride<K extends keyof Overrides & string>(
        key: K,
        value: Overrides[K] | undefined,
    ): Promise<void> {
        const { files, target } = this.activeTargetFiles();
        await files.writeOverride(target, key, value);
        await this.redetect(`${key} saved`);
    }

    /** Writes several keys of the active target's overrides at once, as `saveOverride` writes one. */
    async saveOverrides(patch: Partial<Overrides>): Promise<void> {
        const { files, target } = this.activeTargetFiles();
        await files.writeOverrides(target, patch);
        await this.redetect(`${Object.keys(patch).join(", ")} saved`);
    }

    private activeTargetFiles(): { files: TargetFiles; target: string } {
        const files = this.targetFiles;
        const target = this.target.value;
        if (files === undefined || target === undefined) {
            throw new Error("No Databricks project target is active");
        }
        return { files, target };
    }

    /**
     * Creates the active target's variables file unless it exists, and
     * returns its path. Creating it changes no value, so nothing reloads.
     */
    async ensureVariablesFile(): Promise<string> {
        const { files, target } = this.activeTargetFiles();
        return files.ensureVariablesFile(target);
    }

    /**
     * Deletes the active target's variables file. The variables are unset in
     * `variables` when this resolves; it doesn't wait for the watcher.
     */
    async resetVariables(): Promise<void> {
        const { files, target } = this.activeTargetFiles();
        await files.deleteVariables(target);
        await this.redetect("variables reset");
    }

    /**
     * Reads the target's files again now. For saves of the variables file in
     * an editor: on Linux, VS Code's recursive watcher can miss a folder
     * created mid-session (parcel-bundler/watcher#97), so it never reports
     * the file.
     */
    async reloadTargetFiles(): Promise<void> {
        await this.redetect("target files saved");
    }

    /**
     * Saves `profile` as the `authProfile` of the default target of the
     * bundle in `root`: the one with `default: true`, else the only one. Used
     * for a project that was just created (BNDL-01), before it loads, so its
     * first connection already uses the profile. Returns the target, or
     * undefined when the bundle has none to choose.
     */
    async saveProfileForNewProject(root: string, profile: string): Promise<string | undefined> {
        const files = await readBundleFiles(root);
        if (files.rootFile === undefined) {
            return undefined;
        }
        const { targets, defaultTarget } = localBundleConfig(files.documents);
        const target = defaultTarget ?? (targets.length === 1 ? targets[0]!.name : undefined);
        if (target === undefined) {
            return undefined;
        }
        await new TargetFiles(root).writeOverride(target, "authProfile", profile);
        if (this.active.value?.root === path.normalize(root)) {
            await this.redetect("authProfile saved");
        }
        return target;
    }

    /** Folders below `root` (default: the active folder) that hold a root bundle file, sorted. */
    async findSubProjects(root = this.root.value): Promise<SubProject[]> {
        if (root === undefined) {
            return [];
        }
        const files = await this.deps.search.find(root, subProjectPattern(), EXCLUDED);
        const normalizedRoot = path.normalize(root);
        const realRoot = await realPath(normalizedRoot);
        const found = await Promise.all(
            files.map(async (f) => {
                const file = path.normalize(f);
                const absolute = path.dirname(file);
                const relative = path.relative(normalizedRoot, absolute);
                const realFolder = await realPath(absolute);
                const direct = isReachedDirectly(realFolder, realRoot, relative);
                return {
                    absolute,
                    relative,
                    realFolder,
                    direct,
                    // The bundle's own folder is a link, but none above it is.
                    ownFolderLinked:
                        !direct &&
                        isReachedDirectly(
                            await realPath(path.dirname(absolute)),
                            realRoot,
                            path.dirname(relative),
                        ),
                    realFile: await realPath(file),
                };
            }),
        );
        // The search follows linked folders all the way down, into build
        // output and links back to the sources. So a bundle behind a linked
        // folder only counts when that folder is the bundle's own, and then
        // only if its real file wasn't found without a link, the root's included.
        const directFiles = new Set(found.filter((p) => p.direct).map((p) => p.realFile));
        const projects = new Map<string, SubProject>();
        for (const p of found) {
            if (
                p.realFolder !== realRoot &&
                (p.direct || (p.ownFolderLinked && !directFiles.has(p.realFile)))
            ) {
                projects.set(p.absolute, { absolute: p.absolute, relative: p.relative });
            }
        }
        return [...projects.values()].sort((a, b) => a.relative.localeCompare(b.relative));
    }

    private async redetect(reason: string) {
        this.detection.invalidate(reason);
        await this.detection.settled();
    }

    /** Coalesces file events, then runs a detection pass. */
    private schedule(reason: string) {
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.detection.invalidate(reason);
        }, this.deps.debounceMs ?? BUNDLE_DEBOUNCE_MS);
    }

    private async detect(signal: AbortSignal): Promise<ProjectSnapshot> {
        const root = await this.activeRoot();
        if (root === undefined) {
            this.watch(undefined);
            return EMPTY;
        }
        const files = await this.watch(root)!.read();
        signal.throwIfAborted();
        if (files.rootFile === undefined) {
            return { root, subProjects: await this.findSubProjects(root) };
        }
        for (const error of files.errors) {
            this.deps.log.warn(`Can't read ${error.file}: ${error.message}`);
        }
        // A file that doesn't parse mid-edit keeps the last good config.
        const previous = this.active.value;
        const config =
            files.errors.length > 0 && previous?.root === root
                ? previous.config
                : localBundleConfig(files.documents);
        const project: Project = { root, rootFile: files.rootFile, files: files.files, config };
        const target = this.chooseTarget(project);
        let overrides: Overrides | undefined;
        let variables: VariableOverrides | undefined;
        if (target !== undefined) {
            const targetFiles = new TargetFiles(root);
            try {
                overrides = await targetFiles.readOverrides(target);
            } catch (e) {
                this.deps.log.warn(`Can't read the overrides of target ${target}`, e);
                overrides = {};
            }
            try {
                variables = await targetFiles.readVariables(target);
            } catch (e) {
                // Mid-edit, or not JSON: no overrides, as the old model read it.
                this.deps.log.warn(
                    `Can't read the bundle variable overrides of target ${target}`,
                    e,
                );
                variables = {};
            }
        }
        return {
            root,
            project,
            target,
            overrides,
            variables,
            revision: revisionOf(files.files, files.documents),
            subProjects: [],
        };
    }

    /**
     * The saved project folder, if it still exists inside a workspace folder;
     * else the first workspace folder.
     */
    private async activeRoot(): Promise<string | undefined> {
        const folders = this.deps.folders.value;
        const saved = this.deps.state.get(ACTIVE_PROJECT_PATH);
        if (
            saved !== undefined &&
            folders.some((f) => isInside(saved, f)) &&
            (await isDirectory(saved))
        ) {
            return path.normalize(saved);
        }
        return folders[0] === undefined ? undefined : path.normalize(folders[0]);
    }

    /** The saved target, then the old per-window one, then `default: true`, then the only target. */
    private chooseTarget(project: Project): string | undefined {
        const names = project.config.targets.map((t) => t.name);
        const candidates = [
            this.deps.state.get(PROJECT_TARGETS)[project.root],
            this.deps.state.get(LEGACY_TARGET),
            project.config.defaultTarget,
            names.length === 1 ? names[0] : undefined,
        ];
        return candidates.find((name) => name !== undefined && names.includes(name));
    }

    /**
     * Keeps the watchers on `root`'s bundle files and target files, and
     * nothing else. The target files' watchers are for edits made outside
     * the extension; its own writes reload directly.
     */
    private watch(root: string | undefined): BundleFiles | undefined {
        if (this.watched?.root !== root) {
            this.watched?.bundle.dispose();
            this.watched?.targetFiles.forEach((w) => w.dispose());
            this.watched = undefined;
        }
        if (root !== undefined && this.watched === undefined) {
            const bundle = new BundleFiles(root, this.deps.files, 0);
            bundle.onDidChange(() => this.schedule("bundle files changed"));
            const targetFiles = [
                this.deps.files.watch(root, OVERRIDES_GLOB, () =>
                    this.schedule("overrides changed"),
                ),
                this.deps.files.watch(root, VARIABLES_GLOB, () =>
                    this.schedule("variables changed"),
                ),
            ];
            this.watched = { root, bundle, targetFiles };
        }
        return this.watched?.bundle;
    }

    dispose(): void {
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
        }
        this.watch(undefined);
        disposeAll(this.disposables);
        this.detection.dispose();
        for (const s of [
            this.initialized,
            this.root,
            this.active,
            this.target,
            this.overrides,
            this.variables,
            this.subProjects,
        ]) {
            s.dispose();
        }
        this.current.dispose();
    }
}

function isInside(file: string, folder: string): boolean {
    const relative = path.relative(path.normalize(folder), path.normalize(file));
    return !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function isDirectory(p: string): Promise<boolean> {
    try {
        return (await stat(p)).isDirectory();
    } catch {
        return false;
    }
}

function revisionOf(files: readonly string[], documents: readonly unknown[]): string {
    return createHash("sha256")
        .update(JSON.stringify([files, documents]))
        .digest("hex")
        .slice(0, 16);
}

function keep<T>(previous: T, next: T): T {
    return isDeepStrictEqual(previous, next) ? previous : next;
}
