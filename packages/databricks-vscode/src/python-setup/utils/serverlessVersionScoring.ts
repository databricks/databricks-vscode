/**
 * Pure, weighted scoring of candidate serverless environment versions gathered
 * from several provenance sources. Kept side-effect free so the ranking is
 * deterministic and unit-testable; the collection of raw observations (reading
 * bundle YAML, notebook metadata, the workspace default) happens in the caller
 * and is passed in.
 *
 * Versions are the CLI's bare-integer form (e.g. "4", "5") -- the value
 * `--serverless-version` accepts -- NOT the `vN` display form the CLI echoes in
 * its result output. The picker forwards the chosen value straight into the
 * setup-local invocation, so it must stay bare. Observations that are not a
 * bare integer in the supported range (see {@link isSupportedVersion}) are
 * dropped before scoring, so neither the `vN` form nor an unrealistic version
 * can ever reach the picker or the CLI.
 */

/** Where a candidate serverless version was observed. */
export type VersionSource =
    | "pyproject"
    | "bundleYaml"
    | "notebook"
    | "workspaceDefault"
    | "fallback";

/** A candidate version with its accumulated score and the sources that back it. */
export interface ScoredVersion {
    /** Bare-integer version, e.g. "5". */
    version: string;
    score: number;
    sources: VersionSource[];
}

/** A single raw observation of a version from one source. */
export interface VersionObservation {
    version: string;
    source: VersionSource;
}

/**
 * Per-source weights, high → low: the `pyproject.toml`
 * `[tool.databricks.environment]` declaration is the strongest signal because it
 * is an explicit user choice (the CLI writes it during setup-local), so it must
 * outrank the heuristics; a bundle YAML declaration next, a notebook's recorded
 * environment after that, the workspace default weaker, and the built-in
 * fallback weakest so it only ever wins when nothing else was observed.
 */
export const WEIGHTS: Record<VersionSource, number> = {
    /* eslint-disable @typescript-eslint/naming-convention */
    pyproject: 200,
    bundleYaml: 100,
    notebook: 50,
    workspaceDefault: 20,
    fallback: 1,
    /* eslint-enable @typescript-eslint/naming-convention */
};

/**
 * The version offered when no other source suggests one. Bare integer to match
 * the `--serverless-version` flag.
 */
export const FALLBACK_VERSION = "5";

/** Lowest / highest serverless environment version the CLI accepts, inclusive. */
export const MIN_SUPPORTED_VERSION = 1;
export const MAX_SUPPORTED_VERSION = 5;

/**
 * A version is valid only if it is a bare integer in canonical form (no `vN`
 * prefix, no `+` sign, no decimals, no leading zeros, no surrounding
 * whitespace) within the supported range. This is the trust boundary:
 * observations gathered from bundle YAML, notebook metadata, etc. are untrusted
 * strings, and anything that is not a value the `--serverless-version` flag
 * would accept must never reach the picker or the CLI.
 *
 * The `String(n) === version` check rejects non-canonical spellings like "05"
 * that would otherwise parse into the range but not match the bare string the
 * CLI expects (and would fail to merge with the canonical "5" candidate).
 */
export function isSupportedVersion(version: string): boolean {
    if (!/^\d+$/.test(version)) {
        return false;
    }
    const n = parseInt(version, 10);
    return (
        String(n) === version &&
        n >= MIN_SUPPORTED_VERSION &&
        n <= MAX_SUPPORTED_VERSION
    );
}

function versionNumber(v: string): number {
    return parseInt(v, 10);
}

/**
 * Rank candidate versions by total weight (desc), breaking ties by higher
 * numeric version.
 *
 * Every version in the supported range [{@link MIN_SUPPORTED_VERSION},
 * {@link MAX_SUPPORTED_VERSION}] is always offered as a candidate, so lower
 * versions the project never used stay reachable in the picker rather than
 * being silently unavailable. Versions with no backing observation keep a score
 * of 0 (and no sources), so they sort below any observed candidate. The
 * {@link FALLBACK_VERSION} additionally carries the `fallback` source, so it
 * wins when nothing else was observed; if it coincides with an observed version
 * the two are merged into a single, better-corroborated row rather than
 * duplicated.
 */
export function scoreServerlessVersions(
    observations: VersionObservation[]
): ScoredVersion[] {
    // Drop anything that is not a supported bare integer before it can be
    // scored -- a `vN`-form or unrealistic version must never be forwarded to
    // the CLI. The fallback is known-valid and always kept.
    const all: VersionObservation[] = [
        ...observations.filter((o) => isSupportedVersion(o.version)),
        {version: FALLBACK_VERSION, source: "fallback"},
    ];

    const byVersion = new Map<string, ScoredVersion>();
    // Seed the whole supported range at score 0 so every version the CLI
    // accepts is offered, even ones this project has never observed.
    for (let n = MIN_SUPPORTED_VERSION; n <= MAX_SUPPORTED_VERSION; n++) {
        const version = String(n);
        byVersion.set(version, {version, score: 0, sources: []});
    }
    for (const {version, source} of all) {
        const entry = byVersion.get(version) ?? {
            version,
            score: 0,
            sources: [],
        };
        // Guard against a repeated (version, source) pair inflating the score
        // or listing a source twice -- each source corroborates a version at
        // most once.
        if (!entry.sources.includes(source)) {
            entry.score += WEIGHTS[source];
            entry.sources.push(source);
        }
        byVersion.set(version, entry);
    }

    return [...byVersion.values()].sort(
        (a, b) =>
            b.score - a.score ||
            versionNumber(b.version) - versionNumber(a.version)
    );
}
