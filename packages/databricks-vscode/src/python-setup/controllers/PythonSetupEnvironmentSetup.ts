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
    Required<Pick<PythonSetupResult, "venvPath" | "target" | "resolved">>;

function isLocalEnvironmentReady(
    r: PythonSetupResult
): r is ReadyLocalEnvironmentResult {
    return (
        isPythonSetupSuccess(r) &&
        r.venvPath !== undefined &&
        r.target !== undefined &&
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
}

/**
 * Orchestrates the uv-native "set up Python environment" flow: decide whether
 * to run, resolve the compute target, invoke the CLI under a progress
 * indicator, then adopt the provisioned interpreter and persist state on
 * success — or surface a mapped error on failure.
 */
export class PythonSetupEnvironmentSetup implements Disposable {
    private _ready = false;
    /** True once a setup has completed successfully this session. */
    get ready(): boolean {
        return this._ready;
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

        let result: PythonSetupResult;
        try {
            result = await withProgress(
                "Setting up Python environment",
                (log, token) => cli.run(invocation, {cwd, onLog: log, token})
            );
        } catch (e) {
            // A cancelled run is a user action, not a failure: stay quiet.
            if (e instanceof PythonSetupCancelledError) {
                return;
            }
            // Spawn/parse errors reject with a real Error carrying CLI stderr;
            // there is no result to map, so surface the message directly.
            await this.deps.showError((e as Error).message);
            return;
        }

        if (!isLocalEnvironmentReady(result)) {
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
            await this.deps.showError((e as Error).message);
            return;
        }

        this.deps.saveState({
            envKey: result.target.envKey,
            pythonVersion: result.resolved.pythonVersion,
        });

        this._ready = true;
        this.stateEmitter.fire();
        await this.deps.showSuccess(result);
    }

    dispose(): void {
        this.stateEmitter.dispose();
    }
}
