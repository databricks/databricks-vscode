import {
    scoreServerlessVersions,
    VersionObservation,
} from "./serverlessVersionScoring";
import {
    collectServerlessVersionObservations,
    ServerlessVersionObservationDeps,
} from "./serverlessVersionObservations";
import {pickServerlessVersion} from "./serverlessVersionPicker";

/**
 * Injected collaborators for {@link resolveServerlessVersion}. The (I/O-bound)
 * observation collection and the QuickPick are seams so the resolution flow is
 * unit-testable without a VS Code host, and the pieces wired at the extension
 * site can be swapped in later.
 *
 * The suitability gate is deliberately NOT here: callers own it, because
 * "not a uv-suitable project" and "user dismissed the picker" need different
 * handling at the call site (e.g. the compute picker still enables plain
 * serverless when the project is not uv-suitable, but makes no change on
 * dismissal) -- both of which this function would otherwise collapse into a
 * single `undefined`.
 */
export interface ServerlessVersionResolverDeps {
    /** Gather raw version observations (bundle YAML, notebooks, workspace default). */
    collectObservations: () => Promise<VersionObservation[]>;
    /** Present the ranked candidates and return the confirmed bare version. */
    pick: (
        ranked: ReturnType<typeof scoreServerlessVersions>
    ) => Promise<string | undefined>;
}

/**
 * Resolve the serverless environment version to provision: collect the evidence
 * for what version this project should use (bundle YAML, notebooks, workspace
 * default), score it, and let the user confirm the best-ranked candidate.
 * Returns the confirmed bare version (e.g. "5", the `--serverless-version`
 * value) or `undefined` when the user dismisses the picker.
 *
 * Callers gate this on project uv-suitability; it is only invoked when the uv
 * flow is the active surface. It is deliberately independent of the
 * legacy `databricks.connect.serverlessDbconnectVersion` setting (a
 * DBR/dbconnect version like "17.3"): that is a different namespace consumed by
 * the legacy pip flow and must not leak into `--serverless-version`.
 */
export async function resolveServerlessVersion(
    deps: ServerlessVersionResolverDeps
): Promise<string | undefined> {
    const observations = await deps.collectObservations();
    const ranked = scoreServerlessVersions(observations);
    return deps.pick(ranked);
}

/**
 * Build the "which serverless version should we provision?" prompt: gather the
 * project's evidence, score it, and present the ranked candidates. Returns the
 * confirmed bare version, or undefined when the user dismisses the picker.
 *
 * Exists so the callers that need the whole pipeline as one thunk (the compute
 * picker's serverless branch, and the setup flow resolving a version that was
 * never recorded) share a single composition rather than re-wiring the three
 * pieces each time. `pick` is injectable, defaulting to the real QuickPick, so
 * the composition is testable without a VS Code host.
 */
export function makeServerlessVersionPrompt(
    deps: ServerlessVersionObservationDeps & {
        pick?: ServerlessVersionResolverDeps["pick"];
    }
): () => Promise<string | undefined> {
    return () =>
        resolveServerlessVersion({
            collectObservations: () =>
                collectServerlessVersionObservations(deps),
            pick: deps.pick ?? pickServerlessVersion,
        });
}
