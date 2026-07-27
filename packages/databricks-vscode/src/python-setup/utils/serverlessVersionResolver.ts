import {workspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";
import {PYTHON_SETUP_FEATURE_ID} from "../../feature-manager/FeatureManager";
import {
    scoreServerlessVersions,
    VersionObservation,
} from "./serverlessVersionScoring";

/**
 * Whether the user has opted into the uv-native Python environment setup.
 *
 * The feature ships disabled by default (its CLI command is only in custom CLI
 * builds); it unlocks when {@link PYTHON_SETUP_FEATURE_ID} is present in
 * `databricks.experiments.optInto`. This is the same string the FeatureManager
 * matches to unlock the feature, so the flag can never disagree with it. Kept
 * in `python-setup/` rather than on `workspaceConfigs` to avoid a circular
 * import (WorkspaceConfigs <-> FeatureManager).
 */
export function isPythonSetupEnabled(): boolean {
    return workspaceConfigs.experimetalFeatureOverides.includes(
        PYTHON_SETUP_FEATURE_ID
    );
}

/**
 * Injected collaborators for {@link resolveServerlessVersion}. The (I/O-bound)
 * observation collection and the QuickPick are seams so the resolution flow is
 * unit-testable without a VS Code host, and the pieces wired at the extension
 * site can be swapped in later.
 *
 * The feature-flag gate is deliberately NOT here: callers own it, because
 * "feature off" and "user dismissed the picker" need different handling at the
 * call site (e.g. the compute picker still enables plain serverless when the
 * flag is off, but makes no change on dismissal) -- both of which this function
 * would otherwise collapse into a single `undefined`.
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
 * Callers gate this on the feature flag ({@link isPythonSetupEnabled}); it is
 * only invoked when the flow is active. It is deliberately independent of the
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
