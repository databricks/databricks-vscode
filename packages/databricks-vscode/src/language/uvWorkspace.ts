import path from "node:path";
import {parse} from "smol-toml";

/** The member and exclude globs of a uv workspace declaration. */
export interface UvWorkspace {
    members: string[];
    exclude: string[];
}

/**
 * The uv workspace a `pyproject.toml` declares (`[tool.uv.workspace]`, in any
 * TOML form), or `undefined` if none. Invalid TOML reads as no workspace; uv
 * fails on such a file too.
 */
export function parseUvWorkspace(
    contents: string | undefined
): UvWorkspace | undefined {
    if (contents === undefined) {
        return undefined;
    }
    let document: unknown;
    try {
        document = parse(contents);
    } catch {
        return undefined;
    }
    const workspace = table(table(table(document, "tool"), "uv"), "workspace");
    if (workspace === undefined) {
        return undefined;
    }
    return {
        members: strings(workspace.members),
        exclude: strings(workspace.exclude),
    };
}

function table(
    value: unknown,
    key: string
): Record<string, unknown> | undefined {
    const child =
        typeof value === "object" && value !== null
            ? (value as Record<string, unknown>)[key]
            : undefined;
    return typeof child === "object" && child !== null && !Array.isArray(child)
        ? (child as Record<string, unknown>)
        : undefined;
}

function strings(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
}

/**
 * Whether a uv workspace includes the folder at `memberPath` (relative to the
 * workspace root, `/`-separated): a `members` glob matches it and no `exclude`
 * glob does.
 */
export function uvWorkspaceIncludes(
    workspace: UvWorkspace,
    memberPath: string
): boolean {
    // uv finds members by walking folders, so member wildcards stay inside one
    // folder. It matches `exclude` as a plain pattern, where they cross folders.
    const matches = (globs: string[], crossFolders: boolean) =>
        globs.some((glob) => uvGlob(glob, crossFolders).test(memberPath));
    return (
        matches(workspace.members, false) && !matches(workspace.exclude, true)
    );
}

/**
 * A uv (Rust `glob` crate) pattern as a RegExp: `*`, `?`, `**` as a whole
 * folder, and `[...]` / `[!...]` classes. Braces and `^` are literal.
 */
function uvGlob(glob: string, crossFolders: boolean): RegExp {
    const anyChar = crossFolders ? "." : "[^/]";
    const folders = path.posix
        .normalize(glob)
        .replace(/\/+$/, "")
        .split("/")
        .map((folder) => (folder === "**" ? undefined : folderPattern(folder)))
        // Consecutive `**` folders mean the same as one.
        .filter(
            (folder, i, all) =>
                folder !== undefined || i === 0 || all[i - 1] !== undefined
        );
    // A `**` folder matches zero or more folders, with their separators.
    let source = "";
    folders.forEach((folder, index) => {
        if (folder === undefined) {
            source +=
                index > 0 ? "(?:/.*)?" : folders.length > 1 ? "(?:.*/)?" : ".*";
        } else {
            const leadingStars = index === 1 && folders[0] === undefined;
            source += (index === 0 || leadingStars ? "" : "/") + folder;
        }
    });
    return new RegExp(`^${source}$`);

    function folderPattern(folder: string): string {
        let pattern = "";
        for (let i = 0; i < folder.length; i++) {
            const char = folder[i];
            const negated = char === "[" && folder[i + 1] === "!";
            const bodyStart = i + (negated ? 2 : 1);
            // The first character of a class is literal, even a `]`.
            const classEnd = folder.indexOf("]", bodyStart + 1);
            if (char === "*") {
                pattern += `${anyChar}*`;
            } else if (char === "?") {
                pattern += anyChar;
            } else if (char === "[" && classEnd !== -1) {
                const body = folder
                    .slice(bodyStart, classEnd)
                    .replace(/[\\\]^[]/g, "\\$&");
                const separator = crossFolders ? "" : "/";
                pattern += negated
                    ? `[^${separator}${body}]`
                    : `${crossFolders ? "" : "(?!/)"}[${body}]`;
                i = classEnd;
            } else {
                pattern += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            }
        }
        return pattern;
    }
}
