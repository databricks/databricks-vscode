import path from "node:path";

/**
 * Pure, signal-based detection of the Python package/environment manager(s) a
 * project uses.
 *
 * This module is intentionally side-effect free: callers gather raw signals
 * from disk and the environment (see {@link PackageManagerSignals}) and pass
 * them to {@link detectPackageManagers}, which classifies them. Keeping the
 * classification pure makes it deterministic and trivially unit-testable across
 * the overlap cases (uv+pip, conda+pip, poetry+uv, none).
 *
 * The detection feeds telemetry only (see Events.PYTHON_ENV_SETUP_DETECTED). It
 * never changes setup behaviour, and only categorical/enum data leaves this
 * module — no paths, package names, or other free-form content.
 */

/** A package/environment manager we can attribute a project to. */
export type PackageManager = "uv" | "poetry" | "pip" | "conda";

/** The best-guess primary manager, or "unknown" when no signal fires. */
export type PrimaryManager = PackageManager | "unknown";

/**
 * How the active interpreter was provisioned, independent of which managers the
 * project declares on disk. `poetry` is distinct from `venv`: although poetry
 * uses virtual environments, conflating it with a plain venv would attribute
 * the interpreter to pip and undercount poetry.
 */
export type InterpreterSource =
    | "uv"
    | "poetry"
    | "conda"
    | "system"
    | "venv"
    | "unknown";

/**
 * Individual signals that fired during detection. These are the only free-form
 * strings emitted, and they come from this closed, enumerated set — never from
 * user content.
 */
export type DetectionSignal =
    | "uv.lock"
    | "pyproject.tool.uv"
    | "uv.onPath"
    | "uv.workspaceMember"
    | "interpreter.uv"
    | "poetry.lock"
    | "pyproject.tool.poetry"
    | "poetry.onPath"
    | "interpreter.poetry"
    | "requirements.txt"
    | "constraints.txt"
    | "pyproject.pipOnly"
    | "interpreter.venv"
    | "environment.yml"
    | "conda.prefix"
    | "interpreter.conda";

/**
 * Raw, already-collected signals about a project. Every field is optional so
 * callers can supply only what they could cheaply determine; missing fields are
 * treated as "signal absent". Collecting these must never throw into the user
 * flow — a failed probe should be reported as `false`/`undefined`.
 */
export interface PackageManagerSignals {
    /** A `uv.lock` file exists in the project root. */
    hasUvLock?: boolean;
    /** `pyproject.toml` contains a `[tool.uv]` section. */
    hasPyprojectToolUv?: boolean;
    /** A `uv` executable is resolvable on PATH. */
    uvOnPath?: boolean;
    /** The project is a uv workspace member; its `.venv` is at the root. */
    isUvWorkspaceMember?: boolean;

    /** A `poetry.lock` file exists in the project root. */
    hasPoetryLock?: boolean;
    /** `pyproject.toml` contains a `[tool.poetry]` section. */
    hasPyprojectToolPoetry?: boolean;
    /** A `poetry` executable is resolvable on PATH. */
    poetryOnPath?: boolean;

    /** One or more `requirements*.txt` files exist. */
    hasRequirementsTxt?: boolean;
    /** A `constraints.txt` file exists. */
    hasConstraintsTxt?: boolean;
    /**
     * A `pyproject.toml` declares a packaging table (`[project]` /
     * `[build-system]`) but neither `[tool.uv]` nor `[tool.poetry]` -- i.e. a
     * plain PEP 621 / pip-installable project. A `pyproject.toml` that only
     * carries tool config (e.g. just `[tool.ruff]`) is NOT counted here.
     *
     * Caveat: uv works fine with a bare `[project]` and no `[tool.uv]`, so a uv
     * project without a committed `uv.lock` is counted here as pip. When
     * `uv.lock` is present uv still fires and wins primary, so the skew is
     * limited to lockfile-less uv projects -- but this slightly over-counts pip
     * / under-counts uv (noted for the analytics owner in the handoff doc).
     */
    hasPyprojectPipOnly?: boolean;

    /** An `environment.yml` / `environment.yaml` file exists. */
    hasCondaEnvFile?: boolean;
    /**
     * The active interpreter resides under `CONDA_PREFIX`. Collectors must NOT
     * set this from the bare presence of `CONDA_PREFIX` / `CONDA_DEFAULT_ENV`:
     * those are session-global (set for every project when VS Code is launched
     * from an activated conda shell) and would over-count conda.
     */
    hasCondaPrefix?: boolean;

    /**
     * How the active interpreter was provisioned, if known. Drives both the
     * `interpreter_source` field and a corroborating manager signal.
     */
    interpreterSource?: InterpreterSource;
}

/** The full classification result. All fields are categorical or boolean. */
export interface PackageManagerDetection {
    /** Every manager with at least one firing signal, in priority order. */
    managers: PackageManager[];
    /** Best-guess primary manager, or "unknown" when nothing matched. */
    primary: PrimaryManager;
    /** The exact signals that fired, in a stable order. */
    signals: DetectionSignal[];
    /** True when a lockfile (uv.lock or poetry.lock) was found. */
    hasLockfile: boolean;
    /** How the active interpreter was provisioned. */
    interpreterSource: InterpreterSource;
}

/**
 * Priority order used to pick the primary manager when several apply. uv and
 * poetry are the most specific (they own the whole workflow), conda is next
 * (it provisions the interpreter), and pip is the fallback that almost any
 * project can also satisfy.
 */
const PRIMARY_PRIORITY: PackageManager[] = ["uv", "poetry", "conda", "pip"];

/**
 * Classify a project's package manager(s) from a set of pre-collected signals.
 *
 * Pure and total: any input (including all-empty) yields a well-formed result,
 * defaulting to `unknown`/`[]`. Multiple managers can be reported at once since
 * they legitimately co-exist (e.g. a conda env that also uses pip).
 */
export function detectPackageManagers(
    signals: PackageManagerSignals
): PackageManagerDetection {
    const interpreterSource = signals.interpreterSource ?? "unknown";

    // Build the firing-signal list in a deterministic order. Each entry maps a
    // collected boolean to the enum string emitted in telemetry.
    const firedSignals: DetectionSignal[] = [];
    const fire = (condition: boolean | undefined, signal: DetectionSignal) => {
        if (condition) {
            firedSignals.push(signal);
        }
    };

    fire(signals.hasUvLock, "uv.lock");
    fire(signals.hasPyprojectToolUv, "pyproject.tool.uv");
    fire(signals.uvOnPath, "uv.onPath");
    fire(signals.isUvWorkspaceMember, "uv.workspaceMember");
    fire(interpreterSource === "uv", "interpreter.uv");

    fire(signals.hasPoetryLock, "poetry.lock");
    fire(signals.hasPyprojectToolPoetry, "pyproject.tool.poetry");
    fire(signals.poetryOnPath, "poetry.onPath");
    fire(interpreterSource === "poetry", "interpreter.poetry");

    fire(signals.hasRequirementsTxt, "requirements.txt");
    fire(signals.hasConstraintsTxt, "constraints.txt");
    fire(signals.hasPyprojectPipOnly, "pyproject.pipOnly");
    fire(interpreterSource === "venv", "interpreter.venv");

    fire(signals.hasCondaEnvFile, "environment.yml");
    fire(signals.hasCondaPrefix, "conda.prefix");
    fire(interpreterSource === "conda", "interpreter.conda");

    // A bare `uv`/`poetry` on PATH is a weak signal: it says the tool is
    // installed, not that this project uses it. We still record the signal, but
    // it alone does not attribute the project to that manager — that requires a
    // project marker (lockfile, pyproject section, workspace membership, or
    // interpreter).
    const usesUv =
        Boolean(signals.hasUvLock) ||
        Boolean(signals.hasPyprojectToolUv) ||
        Boolean(signals.isUvWorkspaceMember) ||
        interpreterSource === "uv";
    const usesPoetry =
        Boolean(signals.hasPoetryLock) ||
        Boolean(signals.hasPyprojectToolPoetry) ||
        interpreterSource === "poetry";
    const usesConda =
        Boolean(signals.hasCondaEnvFile) ||
        Boolean(signals.hasCondaPrefix) ||
        interpreterSource === "conda";
    const usesPip =
        Boolean(signals.hasRequirementsTxt) ||
        Boolean(signals.hasConstraintsTxt) ||
        Boolean(signals.hasPyprojectPipOnly) ||
        interpreterSource === "venv";

    const managers: PackageManager[] = [];
    if (usesUv) {
        managers.push("uv");
    }
    if (usesPoetry) {
        managers.push("poetry");
    }
    if (usesConda) {
        managers.push("conda");
    }
    if (usesPip) {
        managers.push("pip");
    }

    const primary: PrimaryManager =
        PRIMARY_PRIORITY.find((m) => managers.includes(m)) ?? "unknown";

    const hasLockfile =
        Boolean(signals.hasUvLock) || Boolean(signals.hasPoetryLock);

    return {
        managers,
        primary,
        signals: firedSignals,
        hasLockfile,
        interpreterSource,
    };
}

/**
 * Whether a `pyproject.toml` declares a `[tool.<name>]` table (the `name`
 * table itself or any subtable such as `[tool.uv.sources]`).
 *
 * A bounded, line-based scan of table headers -- deliberately not a full TOML
 * parse (no dependency needed for this) and more robust than a substring
 * match. It:
 *  - ignores comments (`#`), including a commented-out header,
 *  - ignores `tool.<name>` mentions inside string values or other keys,
 *  - matches subtables, so projects that only have e.g. `[tool.uv.workspace]`
 *    or `[tool.poetry.group.dev.dependencies]` are still detected,
 *  - matches array-of-table headers too, e.g. `[[tool.uv.index]]` or
 *    `[[tool.poetry.source]]`.
 *
 * Pure over the file contents; returns false for undefined input.
 */
export function pyprojectHasToolSection(
    contents: string | undefined,
    name: "uv" | "poetry"
): boolean {
    if (contents === undefined) {
        return false;
    }
    // Matches a table header at the start of a line: `[tool.<name>]`,
    // `[tool.<name>.<subtable>]`, or the array-of-table forms `[[tool.<name>]]`
    // / `[[tool.<name>.<subtable>]]`. The optional second `[` covers the
    // array-of-table case. Whitespace inside the brackets is allowed; anything
    // after `#` on the line is a comment and never reaches here because we
    // strip it first.
    const header = new RegExp(`^\\[\\[?\\s*tool\\.${name}\\s*(\\.|\\])`);
    for (const rawLine of contents.split(/\r?\n/)) {
        const line = rawLine.split("#", 1)[0].trim();
        if (header.test(line)) {
            return true;
        }
    }
    return false;
}

/** The member and exclude globs of a uv workspace declaration. */
export interface UvWorkspace {
    members: string[];
    exclude: string[];
}

const UV_WORKSPACE_KEY = "tool.uv.workspace";
// Stands in for the table of an array-of-tables header (`[[tool.uv.index]]`),
// so its keys never resolve to a workspace key.
const ARRAY_TABLE = "[[]]";

/**
 * The uv workspace a `pyproject.toml` declares, or `undefined` if none. Reads
 * the `[tool.uv.workspace]` table, an inline `workspace = {...}` under
 * `[tool.uv]`, and dotted `workspace.members` keys. A bounded scan that knows
 * comments, strings, and multi-line values, not a full TOML parser.
 */
export function parseUvWorkspace(
    contents: string | undefined
): UvWorkspace | undefined {
    if (contents === undefined) {
        return undefined;
    }
    let workspace: UvWorkspace | undefined;
    const declare = () => (workspace ??= {members: [], exclude: []});
    // One left-to-right pass drops comments and blanks multi-line strings,
    // which can hold anything, including text that looks like a header. A
    // single-line string is kept whole, so a `#` inside it survives, and a
    // `"""` inside a comment never opens a string.
    const lines = contents
        .replace(TOML_TOKEN, (token) =>
            token.startsWith("#")
                ? ""
                : token.startsWith('"""') || token.startsWith("'''")
                  ? '""'
                  : token
        )
        .split(/\r?\n/)
        .map((line) => line.trim());
    let table = "";
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith("[")) {
            const header = /^\[\s*([\w.\- "']+?)\s*\]$/.exec(line);
            table = header ? tomlKey(header[1]) : ARRAY_TABLE;
            if (table === UV_WORKSPACE_KEY) {
                declare();
            }
            continue;
        }
        const assignment = /^([\w.\- "']+?)\s*=\s*(.*)$/.exec(line);
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
            declared.members = inlineArray(value, "members");
            declared.exclude = inlineArray(value, "exclude");
        } else if (key === `${UV_WORKSPACE_KEY}.members`) {
            declared.members = tomlStrings(value);
        } else if (key === `${UV_WORKSPACE_KEY}.exclude`) {
            declared.exclude = tomlStrings(value);
        }
    }
    return workspace;
}

const TOML_STRING = /"((?:[^"\\]|\\.)*)"|'([^']*)'/g;
const TOML_TOKEN =
    /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\\n]|\\.)*"|'[^'\n]*'|#[^\n]*/g;

/** The index of the first `target` outside a quoted string, or -1. */
function indexOutsideStrings(text: string, target: string, from = 0): number {
    let quote: string | undefined;
    for (let i = from; i < text.length; i++) {
        const char = text[i];
        if (quote === '"' && char === "\\") {
            i++;
        } else if (quote !== undefined) {
            quote = char === quote ? undefined : quote;
        } else if (char === '"' || char === "'") {
            quote = char;
        } else if (char === target) {
            return i;
        }
    }
    return -1;
}

/** A dotted TOML key without its quotes and spaces: `tool."uv"` → `tool.uv`. */
function tomlKey(key: string): string {
    return key.replace(/["'\s]/g, "");
}

function bracketsClosed(value: string): boolean {
    const bare = value.replace(TOML_STRING, "");
    const opened = (bare.match(/[[{]/g) ?? []).length;
    const closed = (bare.match(/[\]}]/g) ?? []).length;
    return opened <= closed;
}

function tomlStrings(value: string): string[] {
    return [...value.matchAll(TOML_STRING)].map((m) => m[1] ?? m[2]);
}

function inlineArray(value: string, name: string): string[] {
    const start = new RegExp(`(?:^|[{,\\s])${name}\\s*=\\s*\\[`).exec(value);
    if (!start) {
        return [];
    }
    const from = start.index + start[0].length;
    const end = indexOutsideStrings(value, "]", from);
    return tomlStrings(value.slice(from, end === -1 ? undefined : end));
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
    // uv finds members by walking folders, so a member `*` stays inside one
    // folder. It matches `exclude` as a plain pattern, where `*` also crosses
    // folders.
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
        .map((folder) => {
            if (folder === "**") {
                return undefined;
            }
            let pattern = "";
            for (let i = 0; i < folder.length; i++) {
                const char = folder[i];
                const classEnd = folder.indexOf("]", i + 2);
                if (char === "*") {
                    pattern += `${anyChar}*`;
                } else if (char === "?") {
                    pattern += anyChar;
                } else if (char === "[" && classEnd !== -1) {
                    let body = folder.slice(i + 1, classEnd);
                    const negated = body.startsWith("!");
                    body = (negated ? body.slice(1) : body).replace(
                        /[\\\]^]/g,
                        "\\$&"
                    );
                    pattern += `[${negated ? "^" : ""}${body}]`;
                    i = classEnd;
                } else {
                    pattern += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                }
            }
            return pattern;
        });
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
}

/**
 * Whether a `pyproject.toml` declares an actual packaging table -- `[project]`
 * (PEP 621) or `[build-system]`. Used to distinguish a pip-installable project
 * from a `pyproject.toml` that merely carries tool config (e.g. only
 * `[tool.ruff]` / `[tool.black]`), which must NOT be attributed to pip.
 *
 * Same bounded, comment-aware line scan as {@link pyprojectHasToolSection}.
 * Pure over the file contents; returns false for undefined input.
 */
export function pyprojectHasPackagingTable(
    contents: string | undefined
): boolean {
    if (contents === undefined) {
        return false;
    }
    // `[project]`, `[project.<subtable>]`, or `[build-system]` at line start.
    const header = /^\[\s*(project|build-system)\s*(\.|\])/;
    for (const rawLine of contents.split(/\r?\n/)) {
        const line = rawLine.split("#", 1)[0].trim();
        if (header.test(line)) {
            return true;
        }
    }
    return false;
}

/**
 * Whether the contents of a venv's `pyvenv.cfg` mark it as created by uv. uv
 * writes a `uv = <version>` line into the file it generates; the MS Python
 * extension otherwise reports such venvs as plain virtual environments, so this
 * marker is what distinguishes a genuinely uv-provisioned interpreter.
 *
 * Pure over the file contents; returns false for undefined input.
 */
export function pyvenvCfgMarksUv(contents: string | undefined): boolean {
    if (contents === undefined) {
        return false;
    }
    return /^\s*uv\s*=/m.test(contents);
}

/**
 * Whether an interpreter's `sysPrefix` lies inside a conda prefix -- i.e. the
 * active interpreter is that conda environment, not merely a shell that has
 * `CONDA_PREFIX` exported globally. Both inputs are expected to be absolute
 * paths; comparison uses a trailing-separator boundary so that `/x/envs/ab` is
 * not treated as inside `/x/envs/a`, and accepts both `/` and `\\` separators.
 *
 * `caseInsensitive` controls case folding for the comparison; it defaults to
 * Windows, whose filesystem is case-insensitive (so `C:\Conda` and `c:\conda`
 * denote the same folder). Exposed as a parameter so the behaviour is
 * deterministic in tests regardless of the host platform.
 *
 * Pure over its inputs; returns false if either is missing.
 */
export function interpreterUnderCondaPrefix(
    sysPrefix: string | undefined,
    condaPrefix: string | undefined,
    caseInsensitive: boolean = process.platform === "win32"
): boolean {
    if (!sysPrefix || !condaPrefix) {
        return false;
    }
    const normalize = (p: string) => {
        const stripped = p.replace(/[\\/]+$/, "");
        return caseInsensitive ? stripped.toLowerCase() : stripped;
    };
    const prefix = normalize(sysPrefix);
    const base = normalize(condaPrefix);
    return (
        prefix === base ||
        prefix.startsWith(base + "/") ||
        prefix.startsWith(base + "\\")
    );
}
