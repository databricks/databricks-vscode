import {existsSync} from "fs";
import path from "path";
import {ProgressLocation, Uri, window} from "vscode";
import {PackageManagerDetection} from "../../language/packageManagerDetection";
import {Telemetry} from "../../telemetry";
import "../../telemetry/pythonSetupExtensions";
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
 * {@link shouldShowPythonSetup}).
 *
 * The gate is rendered on the config-view path, so it must never throw: any
 * failure (a rejecting `projectRoot`/`detect`) degrades to `false` so the
 * Environment section keeps showing the legacy checklist rather than rendering
 * empty. Note the classification itself still fails *open*: `detect` maps a
 * signal-collection failure to `unknown`/`[]`, which reads as greenfield and so
 * shows the entry -- an unclassifiable project is treated as safe to offer.
 */
export function makePythonSetupVisibility(deps: {
    isEnabled: () => boolean;
    detect: (projectRoot: string) => Promise<Detection>;
    projectRoot: () => string | undefined;
}): () => Promise<boolean> {
    return async () => {
        try {
            if (!deps.isEnabled()) {
                return false;
            }
            const root = deps.projectRoot();
            if (root === undefined) {
                return false;
            }
            const detection = await deps.detect(root);
            return shouldShowPythonSetup({flagOn: true, detection});
        } catch {
            return false;
        }
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
    /**
     * Sink for the CLI's streamed output (an output channel in the extension).
     * `append` receives each chunk as it arrives; `show` reveals the channel so
     * the user can read the full log when a run fails.
     */
    log: {
        append: (chunk: string) => void;
        show: () => void;
    };
    /** Records the setup attempt/result events. */
    telemetry: Telemetry;
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
        adoptInterpreter: async (venvPath: string, projectRoot: string) => {
            await wiring.setActiveInterpreter(
                venvInterpreterPath(venvPath),
                Uri.file(projectRoot)
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
        notify: async (message: string) => {
            // Pre-flight guidance: no CLI ran, so show a plain warning without
            // revealing the (empty) output channel.
            await window.showWarningMessage(message);
        },
        showError: async (message: string) => {
            // Reveal the streamed CLI log alongside the mapped one-liner so the
            // user can see why the run failed, not just that it did.
            wiring.log.show();
            await window.showErrorMessage(message);
        },
        showSuccess: async () => {
            await window.showInformationMessage(
                "Python environment is set up for Databricks Connect."
            );
        },
        recordSetupAttempt: (attempt) =>
            wiring.telemetry.recordPythonSetupAttempt(attempt),
        recordNoCompute: () => wiring.telemetry.recordPythonSetupNoCompute(),
        getPackageManager: async () => {
            const root = wiring.projectRoot();
            if (root === undefined) {
                return undefined;
            }
            // Same detection the gate ran for this click. It is re-run rather
            // than cached because a project's markers can change between the
            // config view rendering the entry and the user pressing it.
            return (await wiring.detect(root)).primary;
        },
        hasPyprojectToml: async (projectRoot: string) =>
            existsSync(path.join(projectRoot, "pyproject.toml")),
        withProgress: (title, task) =>
            // window.withProgress returns a Thenable; the seam is typed as a
            // Promise, so normalise it. `cancellable` is required for the token
            // to ever fire -- without it VS Code shows no Cancel button and the
            // downstream cancellation path (CLI teardown, PythonSetupCancelledError)
            // would be dead. `log` is forwarded so the CLI's streamed output
            // reaches the output channel instead of being dropped.
            Promise.resolve(
                window.withProgress(
                    {
                        location: ProgressLocation.Notification,
                        title,
                        cancellable: true,
                    },
                    (_progress, token) =>
                        task((chunk) => wiring.log.append(chunk), token)
                )
            ),
    };
}
