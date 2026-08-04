import {Disposable, Event, EventEmitter} from "vscode";
import {
    CancellationLike,
    PythonSetupCancelledError,
    RunOptions,
} from "../gateways/PythonSetupCliClient";
import {
    isPythonSetupSuccess,
    PythonSetupResult,
} from "../models/PythonSetupResult";
import {
    getPythonSetupErrorMessage,
    NO_COMPUTE_TARGET_MESSAGE,
} from "../utils/errorMessages";
import {SetupLocalInvocation} from "../utils/setupLocalArgs";
import {
    PythonSetupAttempt,
    PythonSetupResultReporter,
} from "../../telemetry/pythonSetupExtensions";
import {PrimaryManager} from "../../language/packageManagerDetection";

/**
 * The one method the orchestrator needs from {@link PythonSetupCliClient}, typed
 * structurally so the flow is unit-testable without a spawn/`vscode` dependency.
 */
export interface CliRunner {
    run(
        invocation: SetupLocalInvocation,
        options: RunOptions
    ): Promise<PythonSetupResult>;
}

export type SetupCompute = SetupLocalInvocation["compute"];

/** Persisted after a successful setup, for later drift detection. */
export interface PythonSetupPersistedState {
    envKey: string;
    pythonVersion: string;
}

type ReadyLocalEnvironmentResult = PythonSetupResult &
    Required<Pick<PythonSetupResult, "venvPath" | "compute" | "resolved">>;

function isLocalEnvironmentReady(
    r: PythonSetupResult
): r is ReadyLocalEnvironmentResult {
    return (
        isPythonSetupSuccess(r) &&
        r.venvPath !== undefined &&
        r.compute !== undefined &&
        r.resolved !== undefined
    );
}

/**
 * Runs under a progress indicator, forwarding `log` to the client's `onLog` and
 * `token` to its `RunOptions.token` so a user "Cancel" tears down the CLI. The
 * production wrapper is `window.withProgress` + an output channel.
 */
export type ProgressTask<T> = (
    log: (chunk: string) => void,
    token: CancellationLike
) => Promise<T>;

/**
 * Injected collaborators for {@link PythonSetupEnvironmentSetup}: seams so the
 * decision flow is tested without a VS Code host. The extension assembles the
 * real implementations in `makePythonSetupDeps` (see pythonSetupDeps.ts).
 */
export interface PythonSetupSetupDeps {
    cli: CliRunner;

    /** Absolute path of the open project the CLI runs against, if any. */
    projectRoot: () => string | undefined;

    /**
     * Whether the uv-native setup should run for the current project. The
     * extension wires this to the opt-in flag AND the package-manager gate
     * (`shouldShowPythonSetup` over a live `detect`), so it is false unless the
     * feature is enabled for a clean uv/greenfield project.
     */
    isVisible: () => Promise<boolean>;

    /**
     * The compute target to provision for, or `undefined` to abort silently
     * (nothing selected). The extension resolves this from the attached
     * compute: a cluster maps directly; a serverless session uses the version
     * the compute picker persisted (`serverlessVersion`), so a serverless
     * session with no chosen version yields `undefined`.
     */
    resolveCompute: () => Promise<SetupCompute | undefined>;

    /**
     * Point the MS Python extension at the provisioned venv interpreter for
     * `projectRoot`. The root is passed in (not re-read) so adoption always
     * targets the project the run provisioned, even if the user switched the
     * active project during the (multi-second) CLI run.
     */
    adoptInterpreter: (venvPath: string, projectRoot: string) => Promise<void>;

    saveState: (state: PythonSetupPersistedState) => void;

    /**
     * A plain user-facing notification for pre-flight guidance (e.g. no compute
     * attached), where no CLI ran. Unlike {@link showError} it does not reveal
     * the output channel — there is no log to show.
     */
    notify: (message: string) => Promise<void>;

    /** Shows the mapped, user-facing copy — not raw CLI text. */
    showError: (message: string) => Promise<void>;

    showSuccess: (result: PythonSetupResult) => Promise<void>;

    withProgress: <T>(title: string, task: ProgressTask<T>) => Promise<T>;

    /**
     * Record that a setup run is starting, returning the reporter for its
     * outcome. Injected (rather than taking a `Telemetry`) so the flow's tests
     * assert on plain recorded values with no telemetry client in sight.
     *
     * Called only once a run is actually about to spawn the CLI, so every
     * attempt has exactly one outcome. Clicks that stop earlier (no compute
     * attached, gate closed) are already covered by the
     * `python_env.setup.detected` event's `explicit_command` trigger.
     */
    recordSetupAttempt: (
        attempt: PythonSetupAttempt
    ) => PythonSetupResultReporter;

    /**
     * The project's detected package manager, for the attempt event. Reads the
     * same detection the visibility gate runs; `undefined` when detection was
     * unavailable, in which case the attempt reports `unknown`.
     */
    getPackageManager: () => Promise<PrimaryManager | undefined>;

    /**
     * Whether the project has no `pyproject.toml` yet. Consulted only when the
     * detected manager is uv/unknown — see {@link greenfieldSignal}.
     */
    hasPyprojectToml: (projectRoot: string) => Promise<boolean>;
}

/**
 * The greenfield flag for the attempt event, or `undefined` to omit it.
 *
 * A missing `pyproject.toml` only means "greenfield" for a project that has no
 * competing manager: pip and conda users may never have one, so for them the
 * absence says nothing and reporting it would inflate the greenfield rate. The
 * signal is therefore emitted only for uv/unknown projects — which is exactly
 * the population the visibility gate admits.
 */
async function greenfieldSignal(
    manager: PrimaryManager,
    projectRoot: string,
    hasPyprojectToml: (projectRoot: string) => Promise<boolean>
): Promise<boolean | undefined> {
    if (manager !== "uv" && manager !== "unknown") {
        return undefined;
    }
    return !(await hasPyprojectToml(projectRoot));
}

/**
 * Orchestrates the uv-native "set up Python environment" flow: decide whether
 * to run, resolve the compute target, invoke the CLI under a progress
 * indicator, then adopt the provisioned interpreter and persist state on
 * success — or surface a mapped error on failure.
 */
export class PythonSetupEnvironmentSetup implements Disposable {
    /**
     * Project roots this session has provisioned successfully. Keyed by root
     * (not a single flag) so readiness does not leak across projects: switching
     * the active project to one that was never set up must not render a green
     * "ready" line for it.
     */
    private readonly readyRoots = new Set<string>();
    /**
     * True when the currently active project has been set up successfully this
     * session. Reads the live `projectRoot` so it tracks the active project the
     * config view renders for.
     */
    get ready(): boolean {
        const root = this.deps.projectRoot();
        return root !== undefined && this.readyRoots.has(root);
    }

    private readonly stateEmitter = new EventEmitter<void>();
    /** Fires when {@link ready} flips to true. */
    readonly onDidChangeState: Event<void> = this.stateEmitter.event;

    /**
     * The in-flight run, if any. `setup-local` mutates the project, so
     * overlapping runs against the same cwd would race each other's writes;
     * {@link setup} coalesces onto this instead of spawning a second process.
     */
    private inFlight: Promise<void> | undefined;

    constructor(private readonly deps: PythonSetupSetupDeps) {}

    /**
     * Whether the config view should surface the uv-native entry (instead of
     * the legacy checklist) for the current project. Delegates to the injected
     * gate so the component can decide dispatch without knowing the gate's
     * inputs.
     */
    isVisible(): Promise<boolean> {
        return this.deps.isVisible();
    }

    setup(): Promise<void> {
        // Re-entrancy guard: coalesce concurrent callers onto the running run
        // rather than spawning a second project-mutating CLI process.
        if (this.inFlight) {
            return this.inFlight;
        }
        const run = this.runSetup().finally(() => {
            this.inFlight = undefined;
        });
        this.inFlight = run;
        return run;
    }

    private async runSetup(): Promise<void> {
        const {cli, projectRoot, isVisible, resolveCompute, withProgress} =
            this.deps;

        const cwd = projectRoot();
        if (cwd === undefined) {
            return;
        }
        // Gate first: never touch the project or prompt when the feature is not
        // meant to be offered here.
        if (!(await isVisible())) {
            return;
        }

        const compute = await resolveCompute();
        if (compute === undefined) {
            // The entry is visible whenever the project fits (flag + uv shape),
            // independent of compute — so a user can click the CTA with no
            // cluster attached or a serverless session without a chosen version.
            // Tell them what to do instead of silently no-op'ing the button.
            // Plain notify (not showError): no CLI ran, so there is no log to
            // reveal.
            await this.deps.notify(NO_COMPUTE_TARGET_MESSAGE);
            return;
        }

        const invocation: SetupLocalInvocation = {
            mode: "default",
            compute,
        };

        // From here a run really happens, so the attempt is recorded and every
        // exit below reports an outcome. The reporter also starts the clock:
        // the duration we publish is the whole user-visible wait, including CLI
        // spawn and interpreter adoption.
        const reportResult = await this.recordAttempt(invocation, cwd);

        let result: PythonSetupResult;
        try {
            result = await withProgress(
                "Setting up Python environment",
                (log, token) => cli.run(invocation, {cwd, onLog: log, token})
            );
        } catch (e) {
            // A cancelled run is a user action, not a failure: stay quiet.
            if (e instanceof PythonSetupCancelledError) {
                reportResult({outcome: "cancelled"});
                return;
            }
            // Spawn/parse errors reject with a real Error carrying CLI stderr;
            // there is no result to map, so surface the message directly. No
            // result object exists, hence `not_started` rather than `failed`:
            // there is no phase or error code to attribute the break to.
            reportResult({outcome: "not_started"});
            await this.deps.showError((e as Error).message);
            return;
        }

        if (!isLocalEnvironmentReady(result)) {
            reportResult({
                outcome: "failed",
                failurePhase: result.error?.failurePhase,
                errorCode: result.error?.code,
                envKey: result.compute?.envKey,
                diskMutated: result.error?.diskMutated,
            });
            await this.deps.showError(getPythonSetupErrorMessage(result));
            return;
        }

        // Adoption is the point of the flow: without it the venv exists on disk
        // but is unusable from the editor, so a failure here is a setup failure —
        // surface it and stay not-ready rather than rejecting with no message.
        try {
            // Adopt for the cwd captured at the top of the run, not the live
            // active project: a mid-run project switch must not point another
            // project's interpreter setting at this run's venv.
            await this.deps.adoptInterpreter(result.venvPath, cwd);
        } catch (e) {
            // The CLI succeeded, so there is no CLI error to report — but the
            // flow failed. `adopt` is the extension's own phase, appended to the
            // CLI's six so the funnel shows breaks that happen after it exits.
            reportResult({
                outcome: "failed",
                failurePhase: "adopt",
                envKey: result.compute.envKey,
            });
            await this.deps.showError((e as Error).message);
            return;
        }

        reportResult({outcome: "ok", envKey: result.compute.envKey});

        this.deps.saveState({
            envKey: result.compute.envKey,
            pythonVersion: result.resolved.pythonVersion,
        });

        // Record readiness for the project this run provisioned (the captured
        // cwd), not the live active project — a mid-run switch must not mark a
        // different project ready.
        this.readyRoots.add(cwd);
        this.stateEmitter.fire();
        await this.deps.showSuccess(result);
    }

    /**
     * Emit the attempt event for a run that is about to start and return its
     * outcome reporter.
     *
     * Measurement must never break the flow it measures, so everything here is
     * best-effort: a failure gathering the attempt's context degrades to
     * `unknown`/omitted, and a failure in the emit itself is swallowed — the
     * returned reporter then becomes a no-op rather than throwing mid-run.
     */
    private async recordAttempt(
        invocation: SetupLocalInvocation,
        projectRoot: string
    ): Promise<PythonSetupResultReporter> {
        const {compute} = invocation;
        let packageManager: PrimaryManager = "unknown";
        let isGreenfield: boolean | undefined;
        try {
            packageManager = (await this.deps.getPackageManager()) ?? "unknown";
            isGreenfield = await greenfieldSignal(
                packageManager,
                projectRoot,
                this.deps.hasPyprojectToml
            );
        } catch {
            // Keep the defaults: an attempt with a coarser package-manager
            // value is still worth recording, and a probe failure must not cost
            // the user their setup run.
        }
        try {
            const reportResult = this.deps.recordSetupAttempt({
                packageManager,
                targetType: compute.kind,
                serverlessVersion:
                    compute.kind === "serverless" ? compute.version : undefined,
                mode: invocation.mode,
                isGreenfield,
            });
            return (report) => {
                try {
                    reportResult(report);
                } catch {
                    // Swallow: the run's outcome has already been decided and
                    // surfaced to the user by the time this is called.
                }
            };
        } catch {
            return () => {};
        }
    }

    dispose(): void {
        this.stateEmitter.dispose();
    }
}
