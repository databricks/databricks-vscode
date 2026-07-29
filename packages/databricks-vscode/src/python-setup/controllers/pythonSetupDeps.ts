import {ProgressLocation, Uri, window} from "vscode";
import {PackageManagerDetection} from "../../language/packageManagerDetection";
import {PythonSetupState} from "../../vscode-objs/StateStorage";
import {shouldShowPythonSetup} from "../utils/pythonSetupGate";
import {venvInterpreterPath} from "../utils/venvInterpreterPath";
import {
    CliRunner,
    PythonSetupPersistedState,
    PythonSetupSetupDeps,
    SetupCompute,
} from "./PythonSetupEnvironmentSetup";

type Detection = Pick<PackageManagerDetection, "primary" | "managers">;

/**
 * The compute currently attached in the connection, reduced to what compute
 * resolution needs. Mirrors the relevant {@link ConnectionManager} getters.
 */
export interface AttachedCompute {
    serverless: boolean;
    cluster: {id: string} | undefined;
    /** Persisted serverless environment version, if one was chosen. */
    serverlessVersion: string | undefined;
}

/**
 * Map the attached compute to a setup-local compute target. Pure so the
 * cluster/serverless/none branching is unit-testable.
 *
 * A cluster attachment wins outright (its DBR fully determines the
 * environment). A serverless session resolves to its persisted version -- the
 * one the compute picker recorded (see the serverlessVersion field); without a
 * chosen version there is nothing to provision yet, so this returns undefined
 * and the orchestrator aborts silently rather than guessing.
 */
export function resolveComputeFrom(
    compute: AttachedCompute
): SetupCompute | undefined {
    if (compute.cluster) {
        return {kind: "cluster", clusterId: compute.cluster.id};
    }
    if (compute.serverless && compute.serverlessVersion !== undefined) {
        return {kind: "serverless", version: compute.serverlessVersion};
    }
    return undefined;
}

/**
 * Build the visibility gate for the config-view entry: the feature must be
 * opted into (flag on) AND the active project must be one the uv-native setup
 * fits (a clean uv/greenfield project, no competing manager -- see
 * {@link shouldShowPythonSetup}). Best-effort detection failures degrade to
 * "not a uv project", so the entry simply stays hidden.
 */
export function makePythonSetupVisibility(deps: {
    isEnabled: () => boolean;
    detect: (projectRoot: string) => Promise<Detection>;
    projectRoot: () => string | undefined;
}): () => Promise<boolean> {
    return async () => {
        if (!deps.isEnabled()) {
            return false;
        }
        const root = deps.projectRoot();
        if (root === undefined) {
            return false;
        }
        const detection = await deps.detect(root);
        return shouldShowPythonSetup({flagOn: true, detection});
    };
}

/**
 * Collaborators the extension supplies to assemble the orchestrator's deps.
 * Grouped here so `activate()` stays thin and the wiring is exercised in one
 * place rather than inlined.
 */
export interface PythonSetupWiringDeps {
    cli: CliRunner;
    projectRoot: () => string | undefined;
    isEnabled: () => boolean;
    detect: (projectRoot: string) => Promise<Detection>;
    attachedCompute: () => AttachedCompute;
    /** Point the MS Python extension at an interpreter path (project-scoped). */
    setActiveInterpreter: (interpreterPath: string, root: Uri) => Promise<void>;
    /** Persist the post-setup state (workspace-scoped) for drift detection. */
    persistSetupState: (state: PythonSetupState) => void;
}

/**
 * Assemble the {@link PythonSetupSetupDeps} for the real extension: the gate and
 * compute resolution come from the pure helpers above, the interpreter is
 * adopted via the MS Python extension, and progress/toasts use `window`.
 */
export function makePythonSetupDeps(
    wiring: PythonSetupWiringDeps
): PythonSetupSetupDeps {
    const isVisible = makePythonSetupVisibility(wiring);

    return {
        cli: wiring.cli,
        projectRoot: wiring.projectRoot,
        isVisible,
        resolveCompute: async () =>
            resolveComputeFrom(wiring.attachedCompute()),
        adoptInterpreter: async (venvPath: string) => {
            const root = wiring.projectRoot();
            if (root === undefined) {
                return;
            }
            await wiring.setActiveInterpreter(
                venvInterpreterPath(venvPath),
                Uri.file(root)
            );
        },
        // Stamp the persisted state with the completion time here (the
        // orchestrator supplies the env identity; the timestamp is a wiring
        // concern) and hand it to the injected store for drift detection.
        saveState: (state: PythonSetupPersistedState) => {
            wiring.persistSetupState({
                ...state,
                timestamp: new Date().toISOString(),
            });
        },
        showError: async (message: string) => {
            await window.showErrorMessage(message);
        },
        showSuccess: async () => {
            await window.showInformationMessage(
                "Python environment is set up for Databricks Connect."
            );
        },
        withProgress: (title, task) =>
            // window.withProgress returns a Thenable; the seam is typed as a
            // Promise, so normalise it.
            Promise.resolve(
                window.withProgress(
                    {location: ProgressLocation.Notification, title},
                    (_progress, token) => task(() => {}, token)
                )
            ),
    };
}
