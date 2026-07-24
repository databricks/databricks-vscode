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
import {getPythonSetupErrorMessage} from "../utils/errorMessages";
import {SetupLocalInvocation} from "../utils/setupLocalArgs";

/**
 * The one method the orchestrator needs from {@link PythonSetupCliClient}.
 * Declared structurally (not as the concrete class) so the orchestration logic
 * is unit-testable with a scripted fake and carries no spawn/`vscode`
 * dependency of its own.
 */
export interface CliRunner {
    run(
        invocation: SetupLocalInvocation,
        options: RunOptions
    ): Promise<PythonSetupResult>;
}

/** The compute target the CLI should provision for. */
export type SetupCompute = SetupLocalInvocation["compute"];

/** Persisted after a successful setup, for later drift detection. */
export interface PythonSetupPersistedState {
    envKey: string;
    pythonVersion: string;
}

/**
 * Reports progress while the CLI runs. The orchestrator hands the task a `log`
 * callback it forwards to the client's `onLog`, and a cancellation `token` it
 * forwards to the client's `RunOptions.token` so a user "Cancel" tears down the
 * project-mutating CLI. The production implementation wraps `window.withProgress`
 * + an output channel, passing through the progress notification's own token.
 */
export type ProgressTask<T> = (
    log: (chunk: string) => void,
    token: CancellationLike
) => Promise<T>;

/**
 * Injected collaborators for {@link PythonSetupEnvironmentSetup}. Everything the
 * orchestrator touches beyond pure logic is a seam here, so the decision flow
 * is tested without a VS Code host, and the pieces that are not built yet
 * (the visibility gate, serverless-version selection) are stubbed behind these
 * functions until their own tickets wire the real implementations in.
 */
export interface PythonSetupSetupDeps {
    /** Runs `environments setup-local` (the real client in production). */
    cli: CliRunner;

    /** Absolute path of the open project the CLI runs against, if any. */
    projectRoot: () => string | undefined;

    /**
     * Whether the uv-native setup should run for the current project.
     *
     * TODO(DECO-27781 / #2044): replace the wiring-site stub with
     * `shouldShowPythonSetup({flagOn: workspaceConfigs.pythonSetupEnabled,
     * detection: await detector.detect(projectRoot)})`. Until then the extension
     * passes a stub that returns `false`, so the feature is inert end-to-end.
     */
    isVisible: () => Promise<boolean>;

    /**
     * The compute target to provision for, or `undefined` to abort silently
     * (nothing selected / the user dismissed the picker).
     *
     * TODO(DECO-27782): for a serverless session this must resolve the version
     * via the serverless-version picker (`scoreServerlessVersions` +
     * `pickServerlessVersion`). Until that ticket lands the extension passes a
     * stub that returns `undefined`, so a serverless setup is a no-op; the
     * cluster case can already return `{kind: "cluster", clusterId}`.
     */
    resolveCompute: () => Promise<SetupCompute | undefined>;

    /** Point the MS Python extension at the provisioned venv interpreter. */
    adoptInterpreter: (venvPath: string) => Promise<void>;

    /** Persist setup state for later drift detection. */
    saveState: (state: PythonSetupPersistedState) => void;

    /** Show a failure message (the mapped, user-facing copy). */
    showError: (message: string) => Promise<void>;

    /** Announce a successful setup. */
    showSuccess: (result: PythonSetupResult) => Promise<void>;

    /** Run `task` under a progress indicator, forwarding logs. */
    withProgress: <T>(title: string, task: ProgressTask<T>) => Promise<T>;
}

/**
 * Orchestrates the uv-native "set up Python environment" flow: decide whether
 * to run, resolve the compute target, invoke the CLI under a progress
 * indicator, then adopt the provisioned interpreter and persist state on
 * success — or surface a mapped error on failure.
 *
 * This is the first real caller of {@link PythonSetupCliClient}. The visibility
 * gate and serverless-version selection are injected seams (see
 * {@link PythonSetupSetupDeps}) that the extension currently wires to stubs, so
 * shipping this alongside the client shows the client's usage without depending
 * on tickets that are not built yet.
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
     * The in-flight run, if any. `setup-local` mutates the project (.venv /
     * pyproject.toml), so two overlapping runs against the same cwd would race
     * each other's writes and backup file. We de-duplicate by returning the
     * running promise instead of starting a second CLI process.
     */
    private inFlight: Promise<void> | undefined;

    constructor(private readonly deps: PythonSetupSetupDeps) {}

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

        if (!isPythonSetupSuccess(result)) {
            await this.deps.showError(getPythonSetupErrorMessage(result));
            return;
        }

        // A real-run success must carry everything the success path consumes:
        // the provisioned venv to adopt, and the target/resolved fields we
        // persist as the drift-detection baseline. If any is missing (a dry-run
        // shape, or CLI/schema drift), we can't deliver a usable, tracked
        // environment — treat it as a failure rather than reporting a hollow
        // "ready" that either skips interpreter adoption or leaves drift
        // detection with no baseline.
        if (!result.venvPath || !result.target || !result.resolved) {
            await this.deps.showError(getPythonSetupErrorMessage(result));
            return;
        }

        await this.deps.adoptInterpreter(result.venvPath);
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
