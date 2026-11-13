import { posix } from "node:path";
import { WorkspaceFilesClient } from "@databricks/sdk-workspacefiles/v1";
import type { Disposable, Event } from "vscode";
import { calls, isNotFound, type Connection } from "../../kernel/connection";
import { Emitter } from "../../platform/event";
import { entryUrl, notebookPath, sortEntries, toEntry, type WorkspaceEntry } from "./entries";

/** What changed: a path, or everything after a refresh. */
export type WorkspaceFilesChange =
    | { readonly kind: "created" | "changed" | "deleted"; readonly path: string }
    | { readonly kind: "refreshed" };

/** How long a stat or list result is reused. Short: the tree and the provider ask in bursts. */
const CACHE_TTL_MS = 5_000;

interface Cached<T> {
    readonly at: number;
    readonly value: Promise<T>;
}

/**
 * The workspace's files for one connection (WSFS-01 to WSFS-04), shared by
 * the tree, the `databricks-wsfs:` provider and the commands. Stat and list
 * results are cached briefly; concurrent `stat()` and `list()` calls for a path
 * share one request.
 * The model's own writes, and `refresh()`, drop what they make stale. Changes
 * made elsewhere show after a refresh or once the cache expires, as before;
 * `statFresh()` always asks the workspace.
 */
export class WorkspaceFilesModel implements Disposable {
    private readonly stats = new Map<string, Cached<WorkspaceEntry | undefined>>();
    private readonly lists = new Map<string, Cached<WorkspaceEntry[] | undefined>>();
    private readonly changed = new Emitter<WorkspaceFilesChange>();
    readonly onDidChange: Event<WorkspaceFilesChange> = this.changed.event;

    constructor(
        readonly connection: Connection,
        private readonly now: () => number = Date.now,
    ) {}

    /** The tree's root, `/Users/<me>`, as before. */
    get root(): string {
        return `/Users/${this.connection.userName}`;
    }

    private get client(): WorkspaceFilesClient {
        return this.connection.api.get(WorkspaceFilesClient);
    }

    url(entry: WorkspaceEntry): string {
        return entryUrl(this.connection.host, entry);
    }

    /** Undefined when nothing is at `path`, or the object isn't one the explorer shows. */
    stat(path: string): Promise<WorkspaceEntry | undefined> {
        return this.cached(this.stats, path, () => this.getStatus(path));
    }

    /**
     * A stat that always asks the workspace: the provider's stat, which VS
     * Code calls on open and before a save, must see a change made elsewhere.
     * A request already in flight may predate the change, so it isn't shared.
     * The result is kept for the tree and the reads that follow.
     */
    statFresh(path: string): Promise<WorkspaceEntry | undefined> {
        return this.store(this.stats, path, () => this.getStatus(path));
    }

    private async getStatus(path: string): Promise<WorkspaceEntry | undefined> {
        try {
            return toEntry(await this.client.getStatus({ path }, calls.read()));
        } catch (e) {
            if (isNotFound(e)) {
                return undefined;
            }
            throw e;
        }
    }

    /** The children of a directory, in the old order. Undefined when the directory doesn't exist. */
    list(path: string): Promise<WorkspaceEntry[] | undefined> {
        return this.cached(this.lists, path, async () => {
            try {
                const { objects = [] } = await this.client.list({ path }, calls.read());
                return sortEntries(
                    objects.map(toEntry).filter((e): e is WorkspaceEntry => e !== undefined),
                    this.connection.userName,
                );
            } catch (e) {
                if (isNotFound(e)) {
                    return undefined;
                }
                throw e;
            }
        });
    }

    /** A file's bytes; a notebook's source. */
    async read(path: string): Promise<Uint8Array> {
        const { content } = await this.client.export({ path, format: "AUTO" }, calls.read());
        return content ?? new Uint8Array();
    }

    /**
     * Imports `content` at `path` with format `AUTO`, as before. Resolves to
     * what was created: a `.ipynb` or a notebook source becomes a notebook
     * without its extension, so that path is tried too.
     */
    async write(
        path: string,
        content: Uint8Array,
        overwrite: boolean,
    ): Promise<WorkspaceEntry | undefined> {
        const existed = (await this.stat(path)) !== undefined;
        await this.client.import({ path, content, format: "AUTO", overwrite }, calls.write());
        this.forget(path);
        const created = (await this.stat(path)) ?? (await this.stat(notebookPath(path)));
        this.changed.fire({ kind: existed ? "changed" : "created", path: created?.path ?? path });
        return created;
    }

    /** `mkdirs`, then the new directory's status. */
    async mkdir(path: string): Promise<WorkspaceEntry | undefined> {
        await this.client.mkdirs({ path }, calls.write());
        this.forget(path);
        const created = await this.stat(path);
        this.changed.fire({ kind: "created", path });
        return created;
    }

    async delete(path: string, recursive: boolean): Promise<void> {
        await this.client.delete({ path, recursive }, calls.write());
        this.forget(path, recursive);
        this.changed.fire({ kind: "deleted", path });
    }

    /** Drops every cached result, so the tree shows changes made elsewhere (`databricks.wsfs.refresh`). */
    refresh(): void {
        this.stats.clear();
        this.lists.clear();
        this.changed.fire({ kind: "refreshed" });
    }

    dispose(): void {
        this.stats.clear();
        this.lists.clear();
        this.changed.dispose();
    }

    /** A path's own status, its parent's list, and with `subtree` everything below it. */
    private forget(path: string, subtree = false) {
        this.stats.delete(path);
        this.lists.delete(path);
        this.lists.delete(posix.dirname(path));
        this.stats.delete(notebookPath(path));
        if (subtree) {
            for (const cache of [this.stats, this.lists] as Map<string, unknown>[]) {
                for (const key of cache.keys()) {
                    if (key.startsWith(path + "/")) {
                        cache.delete(key);
                    }
                }
            }
        }
    }

    private cached<T>(
        cache: Map<string, Cached<T>>,
        path: string,
        load: () => Promise<T>,
    ): Promise<T> {
        const hit = cache.get(path);
        if (hit !== undefined && this.now() - hit.at < CACHE_TTL_MS) {
            return hit.value;
        }
        return this.store(cache, path, load);
    }

    /**
     * Loads and caches the result. The newest call to start wins: the entry is
     * set when the call starts, and a request that settles later doesn't replace it.
     */
    private store<T>(
        cache: Map<string, Cached<T>>,
        path: string,
        load: () => Promise<T>,
    ): Promise<T> {
        const value = load();
        const entry = { at: this.now(), value };
        cache.set(path, entry);
        // A failure isn't cached: the next call tries again.
        value.catch(() => {
            if (cache.get(path) === entry) {
                cache.delete(path);
            }
        });
        return value;
    }
}
