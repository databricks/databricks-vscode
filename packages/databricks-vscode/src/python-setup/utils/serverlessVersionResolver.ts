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
 * Injected collaborators for {@link resolveServerlessVersion}. The feature
 * gate, the (I/O-bound) observation collection, and the QuickPick are all seams
 * so the resolution flow is unit-testable without a VS Code host, and the
 * pieces wired at the extension site can be swapped in later.
 */
export interface ServerlessVersionResolverDeps {
    /** Feature-flag gate; defaults to {@link isPythonSetupEnabled} in prod. */
    isEnabled: () => boolean;
    /** Gather raw version observations (bundle YAML, notebooks, workspace default). */
    collectObservations: () => Promise<VersionObservation[]>;
    /** Present the ranked candidates and return the confirmed bare version. */
    pick: (
        ranked: ReturnType<typeof scoreServerlessVersions>
    ) => Promise<string | undefined>;
}

/**
 * Resolve the serverless environment version to provision: gate on the feature
 * flag, collect observations, score them, and let the user confirm a candidate.
 * Returns the confirmed bare version (e.g. "5", the `--serverless-version`
 * value) or `undefined` when the feature is disabled or the user dismisses the
 * picker.
 *
 * The flag gate is checked first, before any collection or UI, so with the
 * feature off the resolver is completely inert -- no disk reads, no picker.
 * This is deliberately independent of the legacy
 * `databricks.connect.serverlessDbconnectVersion` setting (a DBR/dbconnect
 * version like "17.3"): that is a different namespace consumed by the legacy
 * pip flow and must not leak into `--serverless-version`.
 */
export async function resolveServerlessVersion(
    deps: ServerlessVersionResolverDeps
): Promise<string | undefined> {
    if (!deps.isEnabled()) {
        return undefined;
    }
    const observations = await deps.collectObservations();
    const ranked = scoreServerlessVersions(observations);
    return deps.pick(ranked);
}
