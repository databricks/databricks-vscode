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
    formatSetupFailureDetail,
    getPythonSetupErrorMessage,
    NO_COMPUTE_TARGET_MESSAGE,
} from "../utils/errorMessages";
import {SetupLocalInvocation} from "../utils/setupLocalArgs";
import {
    PythonSetupAttempt,
    PythonSetupResultReporter,
} from "../../telemetry/pythonSetupExtensions";
import {PrimaryManager} from "../../language/packageManagerDetection";
import {
    isUvSetupSuitable,
    SuitabilityDetection,
} from "../utils/pythonSetupGate";

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

/**
 * What the compute seam resolved to. `cancelled` means the user was asked for a
 * missing piece (a serverless version) and dismissed the prompt -- a user
 * action, not a dead end, so it must stay silent and must not be counted as a
 * no-compute click.
 */
export type ResolvedCompute =
    | {status: "ok"; compute: SetupCompute}
    | {status: "none"}
    | {status: "cancelled"};

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
     * The compute target to provision for. `none` means nothing is attached
     * (the CTA is a dead end -- guide the user); `cancelled` means the user
     * dismissed a prompt for a missing detail and the flow should stop quietly.
     * The extension resolves this from the attached compute: a cluster maps
     * directly, a serverless session uses the version the compute picker
     * persisted (`serverlessVersion`), and a serverless session with no chosen
     * version prompts for one.
     */
    resolveCompute: () => Promise<ResolvedCompute>;

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
     * attached), where no CLI ran. Unlike {@link showError} it offers no log
     * affordance — there is no log to show.
     */
    notify: (message: string) => Promise<void>;

    /**
     * Shows the mapped, user-facing copy — not raw CLI text — with a "Show Logs"
     * action that reveals the setup output channel. `detail`, when given, is
     * written to that channel first (see `formatSetupFailureDetail`), so the
     * button leads to the CLI's full explanation instead of an empty log.
     */
    showError: (message: string, detail?: string) => Promise<void>;

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
     * Record that the CTA was pressed with nothing to set up for, so no run
     * started. Reported without an attempt (the one exception to the pairing),
     * because a visible button that dead-ends is worth measuring and no other
     * event covers it: `python_env.setup.detected`'s `explicit_command` trigger
     * fires only from the legacy setup command, which the config view shows
     * mutually exclusively with this entry.
     */
    recordNoCompute: () => void;

    /**
     * The project's package-manager detection, for the attempt event. Reads the
     * same detection the visibility gate runs — the whole result rather than
     * just `primary`, because the greenfield signal needs the manager list and
     * the fired signals to reuse the gate's own suitability predicate.
     * `undefined` when detection was unavailable, in which case the attempt
     * reports `unknown` and omits the greenfield flag.
     */
    getDetection: () => Promise<
        (SuitabilityDetection & {primary: PrimaryManager}) | undefined
    >;

    /**
     * Whether the project has no `pyproject.toml` yet. Consulted only for a
     * uv-suitable project — see {@link greenfieldSignal}.
     */
    hasPyprojectToml: (projectRoot: string) => Promise<boolean>;
}

/**
 * The greenfield flag for the attempt event, or `undefined` to omit it.
 *
 * A missing `pyproject.toml` only means "greenfield" for a project that has no
 * competing manager: pip and conda users may never have one, so for them the
 * absence says nothing and reporting it would inflate the greenfield rate.
 *
 * The population is therefore exactly the one the visibility gate admits, by
 * construction: both ask {@link isUvSetupSuitable}. Reusing the gate's predicate
 * rather than re-deriving it from `primary` matters, because a packaging-shaped
 * `pyproject.toml` is attributed to pip while still being a project we set up —
 * keying off `primary` alone would blank this field for every freshly-initialised
 * bundle project, i.e. the exact cohort worth measuring.
 */
async function greenfieldSignal(
    detection: SuitabilityDetection,
    projectRoot: string,
    hasPyprojectToml: (projectRoot: string) => Promise<boolean>
): Promise<boolean | undefined> {
    if (!isUvSetupSuitable(detection)) {
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

        const resolved = await resolveCompute();
        if (resolved.status === "cancelled") {
            // The user was asked for the missing serverless version and
            // dismissed the prompt. That is a deliberate bail-out, not a dead
            // end: stay silent (as with a cancelled run) and record nothing, so
            // the no-compute metric keeps meaning "the CTA had nothing to do".
            return;
        }
        if (resolved.status === "none") {
            // The entry is visible whenever the project fits (flag + uv shape),
            // independent of compute — so a user can click the CTA with no
            // compute attached at all. Tell them what to do instead of silently
            // no-op'ing the button. Plain notify (not showError): no CLI ran, so
            // there is no log to reveal.
            try {
                this.deps.recordNoCompute();
            } catch {
                // Measurement must never break the flow it measures.
            }
            await this.deps.notify(NO_COMPUTE_TARGET_MESSAGE);
            return;
        }
        const compute = resolved.compute;

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
            await this.deps.showError(
                getPythonSetupErrorMessage(result),
                formatSetupFailureDetail(result)
            );
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

        // Do the state bookkeeping *before* reporting success, so a throw here
        // is never recorded as `ok`.
        try {
            this.deps.saveState({
                envKey: result.compute.envKey,
                pythonVersion: result.resolved.pythonVersion,
            });
            // Record readiness for the project this run provisioned (the
            // captured cwd), not the live active project — a mid-run switch must
            // not mark a different project ready.
            this.readyRoots.add(cwd);
            this.stateEmitter.fire();
        } catch (e) {
            reportResult({
                outcome: "failed",
                failurePhase: "persist",
                envKey: result.compute.envKey,
            });
            throw e;
        }

        // Reported before `showSuccess` on purpose: that awaits the user
        // dismissing the notification, and folding think-time into `duration`
        // would wreck the setup-time metric this event exists to measure.
        reportResult({outcome: "ok", envKey: result.compute.envKey});

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
        // An unavailable detection degrades to "no manager fired", which reads as
        // a greenfield-suitable project -- the same reading the visibility gate
        // gives it, so the two stay consistent even on the failure path.
        let detection: SuitabilityDetection = {managers: [], signals: []};
        let packageManager: PrimaryManager = "unknown";
        let isGreenfield: boolean | undefined;
        // Two independent probes, so they get independent try blocks: a failing
        // pyproject.toml probe must not discard a package manager that was
        // detected successfully (that would bias the manager distribution toward
        // `unknown`). Either failing just narrows the attempt, never breaks the
        // user's setup run.
        try {
            const detected = await this.deps.getDetection();
            if (detected !== undefined) {
                detection = detected;
                packageManager = detected.primary;
            }
        } catch {
            // Keep `unknown` and the greenfield-suitable default.
        }
        try {
            isGreenfield = await greenfieldSignal(
                detection,
                projectRoot,
                this.deps.hasPyprojectToml
            );
        } catch {
            // Leave isGreenfield undefined, i.e. omitted from the event.
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
