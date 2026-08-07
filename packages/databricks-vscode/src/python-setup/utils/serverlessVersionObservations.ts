import {VersionObservation} from "./serverlessVersionScoring";
import {collectBundleServerlessVersions} from "./bundleServerlessVersions";
import {collectProjectNotebookVersions} from "./projectNotebookVersions";

/**
 * Where the version evidence comes from. Injected so collection stays testable
 * without a bundle or a workspace, and so both call sites (compute selection and
 * the setup flow) supply their own accessors.
 */
export interface ServerlessVersionObservationDeps {
    /** The parsed bundle validate config, if a bundle is loaded. */
    getValidateConfig: () => Promise<unknown>;
    /** The active project root, or undefined when no project is open. */
    projectRoot: () => string | undefined;
}

/**
 * Gather serverless-version evidence from the project's local sources (bundle
 * config + notebooks). Each source is collected independently and guarded, so
 * one failing source never blocks the other or the flow that asked for it; the
 * scorer merges and de-dupes across sources.
 *
 * The scorer also defines a `workspaceDefault` source, which is not collected
 * here: it would come from the workspace's default base environment, and the SDK
 * we depend on exposes no base-environment API yet. Until it does, that weight
 * simply never contributes and the ranking falls back to the local sources.
 */
export async function collectServerlessVersionObservations(
    deps: ServerlessVersionObservationDeps
): Promise<VersionObservation[]> {
    const [bundle, notebooks] = await Promise.all([
        (async () => {
            try {
                return collectBundleServerlessVersions(
                    await deps.getValidateConfig()
                );
            } catch {
                return [] as VersionObservation[];
            }
        })(),
        (async () => {
            try {
                const root = deps.projectRoot();
                if (root === undefined) {
                    return [] as VersionObservation[];
                }
                return await collectProjectNotebookVersions(root);
            } catch {
                // No active project, or the notebook scan failed -- contribute
                // nothing rather than blocking the flow that asked.
                return [] as VersionObservation[];
            }
        })(),
    ]);
    return [...bundle, ...notebooks];
}
