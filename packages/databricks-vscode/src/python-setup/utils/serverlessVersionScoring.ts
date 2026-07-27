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
 * setup-local invocation, so it must stay bare.
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

function versionNumber(v: string): number {
    const n = parseInt(v.replace(/^v/i, ""), 10);
    return Number.isFinite(n) ? n : 0;
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
    const all: VersionObservation[] = [
        ...observations,
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
