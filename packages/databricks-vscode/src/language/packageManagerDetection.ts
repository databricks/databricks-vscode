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
 * project declares on disk.
 */
export type InterpreterSource = "uv" | "conda" | "system" | "venv" | "unknown";

/**
 * Individual signals that fired during detection. These are the only free-form
 * strings emitted, and they come from this closed, enumerated set — never from
 * user content.
 */
export type DetectionSignal =
    | "uv.lock"
    | "pyproject.tool.uv"
    | "uv.onPath"
    | "interpreter.uv"
    | "poetry.lock"
    | "pyproject.tool.poetry"
    | "poetry.onPath"
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
     * A `pyproject.toml` exists but declares neither `[tool.uv]` nor
     * `[tool.poetry]` (i.e. a plain PEP 621 / pip-installable project).
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
    fire(interpreterSource === "uv", "interpreter.uv");

    fire(signals.hasPoetryLock, "poetry.lock");
    fire(signals.hasPyprojectToolPoetry, "pyproject.tool.poetry");
    fire(signals.poetryOnPath, "poetry.onPath");

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
    // project-local marker (lockfile, pyproject section, or interpreter).
    const usesUv =
        Boolean(signals.hasUvLock) ||
        Boolean(signals.hasPyprojectToolUv) ||
        interpreterSource === "uv";
    const usesPoetry =
        Boolean(signals.hasPoetryLock) ||
        Boolean(signals.hasPyprojectToolPoetry);
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
