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
 * Per-source weights, high → low: an explicit project declaration (bundle YAML)
 * is the strongest signal, a notebook's recorded environment next, the
 * workspace default weaker, and the built-in fallback weakest so it only ever
 * wins when nothing else was observed.
 */
export const WEIGHTS: Record<VersionSource, number> = {
    /* eslint-disable @typescript-eslint/naming-convention */
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
 * A version is valid only if it is a bare integer (no `vN` prefix, no decimals,
 * no surrounding whitespace) within the supported range. This is the trust
 * boundary: observations gathered from bundle YAML, notebook metadata, etc. are
 * untrusted strings, and anything that is not a value the `--serverless-version`
 * flag would accept must never reach the picker or the CLI.
 */
export function isSupportedVersion(version: string): boolean {
    if (!/^\d+$/.test(version)) {
        return false;
    }
    const n = parseInt(version, 10);
    return n >= MIN_SUPPORTED_VERSION && n <= MAX_SUPPORTED_VERSION;
}

function versionNumber(v: string): number {
    return parseInt(v, 10);
}

/**
 * Rank candidate versions by total weight (desc), breaking ties by higher
 * numeric version. The {@link FALLBACK_VERSION} is always included as a
 * candidate; if it coincides with an observed version the two are merged into a
 * single, better-corroborated row rather than duplicated.
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
