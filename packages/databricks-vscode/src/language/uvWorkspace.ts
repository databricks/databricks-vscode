import path from "node:path";

/** The member and exclude globs of a uv workspace declaration. */
export interface UvWorkspace {
    members: string[];
    exclude: string[];
}

const UV_WORKSPACE_KEY = "tool.uv.workspace";
// Stands in for the table of an array-of-tables header (`[[tool.uv.index]]`),
// so its keys never resolve to a workspace key.
const ARRAY_TABLE = "[[]]";

const BASIC_STRING = String.raw`"(?:[^"\\\n]|\\.)*"`;
const LITERAL_STRING = String.raw`'[^'\n]*'`;
const KEY_PART = String.raw`(?:[\w-]+|${BASIC_STRING}|${LITERAL_STRING})`;
const KEY = String.raw`${KEY_PART}(?:\s*\.\s*${KEY_PART})*`;
const HEADER = new RegExp(String.raw`^\[\s*(${KEY})\s*\]$`);
const ASSIGNMENT = new RegExp(String.raw`^(${KEY})\s*=\s*(.*)$`);
const STRING = new RegExp(`${BASIC_STRING}|${LITERAL_STRING}`, "g");
// Comments, strings, and multi-line strings, matched left to right, so a `#`
// inside a string and a `"""` inside a comment are both read correctly.
const TOKEN = new RegExp(
    String.raw`"""(?:[^\\]|\\[\s\S])*?"""|'''[\s\S]*?'''|${BASIC_STRING}|${LITERAL_STRING}|#[^\n]*`,
    "g"
);

/**
 * The uv workspace a `pyproject.toml` declares, or `undefined` if none. Reads
 * the `[tool.uv.workspace]` table, an inline `workspace = {...}` under
 * `[tool.uv]`, and dotted `workspace.members` keys. A bounded scan, not a full
 * TOML parser: it knows comments, strings, and multi-line values.
 */
export function parseUvWorkspace(
    contents: string | undefined
): UvWorkspace | undefined {
    if (contents === undefined) {
        return undefined;
    }
    let workspace: UvWorkspace | undefined;
    const declare = () => (workspace ??= {members: [], exclude: []});
    const lines = contents
        .replace(TOKEN, normalizeToken)
        .split(/\r?\n/)
        .map((line) => line.trim());
    let table = "";
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith("[")) {
            const header = HEADER.exec(line);
            table = header ? tomlKey(header[1]) : ARRAY_TABLE;
            if (table === UV_WORKSPACE_KEY) {
                declare();
            }
            continue;
        }
        const assignment = ASSIGNMENT.exec(line);
        if (!assignment) {
            continue;
        }
        // An array or inline table may span lines until its brackets close;
        // consume them all, so a nested line is never read as a header.
        let value = assignment[2];
        while (!bracketsClosed(value) && i + 1 < lines.length) {
            value += " " + lines[++i];
        }
        const key = [table, tomlKey(assignment[1])].filter(Boolean).join(".");
        if (
            key !== UV_WORKSPACE_KEY &&
            !key.startsWith(`${UV_WORKSPACE_KEY}.`)
        ) {
            continue;
        }
        const declared = declare();
        if (key === UV_WORKSPACE_KEY) {
            const entries = inlineTable(value);
            declared.members = tomlStrings(entries.get("members") ?? "");
            declared.exclude = tomlStrings(entries.get("exclude") ?? "");
        } else if (key === `${UV_WORKSPACE_KEY}.members`) {
            declared.members = tomlStrings(value);
        } else if (key === `${UV_WORKSPACE_KEY}.exclude`) {
            declared.exclude = tomlStrings(value);
        }
    }
    return workspace;
}

/**
 * Drop a comment. Turn a multi-line string into a one-line string when it has
 * no line break or quote (so `'''pkgs/a'''` keeps its value), and blank it
 * otherwise: it can hold anything, including text that looks like a header.
 */
function normalizeToken(token: string): string {
    if (token.startsWith("#")) {
        return "";
    }
    if (token.startsWith('"""') || token.startsWith("'''")) {
        const quote = token[0];
        const body = token.slice(3, -3);
        return /[\n"']/.test(body) ? '""' : `${quote}${body}${quote}`;
    }
    return token;
}

/** A dotted TOML key without its quotes and spaces: `tool."uv"` → `tool.uv`. */
function tomlKey(key: string): string {
    return key.replace(/["'\s]/g, "");
}

function bracketsClosed(value: string): boolean {
    const bare = value.replace(STRING, "");
    const opened = (bare.match(/[[{]/g) ?? []).length;
    const closed = (bare.match(/[\]}]/g) ?? []).length;
    return opened <= closed;
}

/** The decoded values of the strings in `value`. */
function tomlStrings(value: string): string[] {
    return (value.match(STRING) ?? []).map((token) =>
        token.startsWith("'")
            ? token.slice(1, -1)
            : token.slice(1, -1).replace(/\\(u.{4}|U.{8}|.)/g, decodeEscape)
    );
}

const ESCAPES = new Map([
    ["b", "\b"],
    ["t", "\t"],
    ["n", "\n"],
    ["f", "\f"],
    ["r", "\r"],
    ['"', '"'],
    ["\\", "\\"],
]);

function decodeEscape(_match: string, escape: string): string {
    return escape.length > 1
        ? String.fromCodePoint(parseInt(escape.slice(1), 16))
        : ESCAPES.get(escape) ?? escape;
}

/** The top-level `key = value` entries of the inline table in `value`. */
function inlineTable(value: string): Map<string, string> {
    const entries = new Map<string, string>();
    const open = value.indexOf("{");
    if (open === -1) {
        return entries;
    }
    const addEntry = (from: number, to: number) => {
        const entry = value.slice(from, to);
        const equals = indexOutsideStrings(entry, (char) => char === "=");
        if (equals !== -1) {
            entries.set(
                tomlKey(entry.slice(0, equals)),
                entry.slice(equals + 1)
            );
        }
    };
    let depth = 0;
    let from = open + 1;
    indexOutsideStrings(
        value,
        (char, i) => {
            if (char === "[" || char === "{") {
                depth++;
            } else if ((char === "]" || char === "}") && depth > 0) {
                depth--;
            } else if (char === "}" || (char === "," && depth === 0)) {
                addEntry(from, i);
                from = i + 1;
                return char === "}";
            }
            return false;
        },
        open + 1
    );
    return entries;
}

/**
 * The index of the first character outside a quoted string for which `stop`
 * returns true, or -1.
 */
function indexOutsideStrings(
    text: string,
    stop: (char: string, index: number) => boolean,
    from = 0
): number {
    let quote: string | undefined;
    for (let i = from; i < text.length; i++) {
        const char = text[i];
        if (quote === '"' && char === "\\") {
            i++;
        } else if (quote !== undefined) {
            quote = char === quote ? undefined : quote;
        } else if (char === '"' || char === "'") {
            quote = char;
        } else if (stop(char, i)) {
            return i;
        }
    }
    return -1;
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
