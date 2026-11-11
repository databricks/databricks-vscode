import { posix } from "node:path";
import type { ObjectInfo } from "@databricks/sdk-workspacefiles/v1";

/** The object types the explorer shows. Libraries and anything newer are skipped, as before. */
export type EntryType = "DIRECTORY" | "REPO" | "FILE" | "NOTEBOOK";

const ENTRY_TYPES: readonly string[] = ["DIRECTORY", "REPO", "FILE", "NOTEBOOK"];

/** A workspace object the explorer can show. Ports the old `WorkspaceFsEntity`'s required fields. */
export interface WorkspaceEntry {
    readonly path: string;
    readonly type: EntryType;
    readonly id: number;
    readonly language?: string;
    readonly size?: number;
    /** Epoch milliseconds. */
    readonly createdAt?: number;
    readonly modifiedAt?: number;
}

/** Undefined for an object without a path, ID or known type; the old entity threw for those. */
export function toEntry(o: ObjectInfo): WorkspaceEntry | undefined {
    if (
        o.path === undefined ||
        o.objectId === undefined ||
        o.objectType === undefined ||
        !ENTRY_TYPES.includes(o.objectType)
    ) {
        return undefined;
    }
    return {
        path: o.path,
        type: o.objectType as EntryType,
        id: Number(o.objectId),
        ...(o.language !== undefined ? { language: o.language } : {}),
        ...(o.size !== undefined ? { size: Number(o.size) } : {}),
        ...(o.createdAt !== undefined ? { createdAt: Number(o.createdAt) } : {}),
        ...(o.modifiedAt !== undefined ? { modifiedAt: Number(o.modifiedAt) } : {}),
    };
}

/** A directory or a repo: something that has children. */
export function isDirectory(
    entry?: WorkspaceEntry,
): entry is WorkspaceEntry & { type: "DIRECTORY" | "REPO" } {
    return entry?.type === "DIRECTORY" || entry?.type === "REPO";
}

export function isRepo(entry?: WorkspaceEntry): entry is WorkspaceEntry & { type: "REPO" } {
    return entry?.type === "REPO";
}

/** A file or a notebook: something with content. */
export function isFile(
    entry?: WorkspaceEntry,
): entry is WorkspaceEntry & { type: "FILE" | "NOTEBOOK" } {
    return entry?.type === "FILE" || entry?.type === "NOTEBOOK";
}

export function isNotebook(entry?: WorkspaceEntry): entry is WorkspaceEntry & { type: "NOTEBOOK" } {
    return entry?.type === "NOTEBOOK";
}

export function basename(path: string): string {
    return posix.basename(path);
}

/**
 * `input` resolved against the directory `root`, if the result is `root`
 * or below it; undefined otherwise. Ported from `getAbsoluteChildPath`.
 */
export function childPath(root: string, input: string): string | undefined {
    const resolved = posix.resolve(root, input);
    const relative = posix.relative(root, resolved);
    if (
        !posix.isAbsolute(relative) &&
        !relative.startsWith(".." + posix.sep) &&
        relative !== ".."
    ) {
        return resolved;
    }
    return undefined;
}

/** The old URLs: folders and repos are browsed, files and notebooks open in the editor. */
export function entryUrl(host: string, entry: WorkspaceEntry): string {
    const origin = new URL(host).origin;
    switch (entry.type) {
        case "DIRECTORY":
        case "REPO":
            return `${origin}/browse/folders/${entry.id}`;
        case "FILE":
            return `${origin}/editor/files/${entry.id}`;
        case "NOTEBOOK":
            return `${origin}/editor/notebooks/${entry.id}`;
    }
}

/**
 * The old order: `/Users`, `/Shared`, `/Repos`, then the user's own folders
 * in `/Users` and `/Repos`; then directories and repos; then by path.
 */
export function sortEntries(
    entries: readonly WorkspaceEntry[],
    userName: string,
): WorkspaceEntry[] {
    const priority = ["/Users", "/Shared", "/Repos", `/Users/${userName}`, `/Repos/${userName}`];
    const rank = (e: WorkspaceEntry) => {
        const i = priority.indexOf(e.path);
        return i !== -1 ? i : isDirectory(e) ? priority.length : priority.length + 1;
    };
    return [...entries].sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
}

/** A notebook imported as `name.ipynb` (or `.py`, `.scala`, `.r`, `.sql`) is stored as `name`. */
export function notebookPath(path: string): string {
    return path.replace(/^(\/.*)\.(py|ipynb|scala|r|sql)$/i, "$1");
}
