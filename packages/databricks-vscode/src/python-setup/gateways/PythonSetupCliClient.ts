import {
    run as runCli,
    CancellationLike,
    SpawnFn,
    TerminateFn,
} from "../../cli/cliProcess";
import {
    buildSetupLocalArgs,
    SetupLocalInvocation,
} from "../utils/setupLocalArgs";
import {
    parsePythonSetupResult,
    PythonSetupResult,
} from "../models/PythonSetupResult";

// Re-exported so consumers (e.g. PythonSetupDriftManager) and this gateway's
// tests keep a single import site while the process primitives live in the
// shared, vscode-free cli/cliProcess module.
export type {CancellationLike, SpawnFn} from "../../cli/cliProcess";

/**
 * Rejection raised when a {@link PythonSetupCliClient.run} is aborted via its
 * cancellation token, so callers can distinguish a user cancellation from a
 * genuine CLI failure (which surfaces as a `PythonSetupParseError` or the
 * spawn error).
 */
export class PythonSetupCancelledError extends Error {
    constructor() {
        super("Python setup was cancelled");
        this.name = "PythonSetupCancelledError";
    }
}

export interface RunOptions {
    /** Working directory the CLI runs in (the project root). */
    cwd: string;
    /** Receives raw stderr chunks for the output/"Show Logs" channel. */
    onLog?: (chunk: string) => void;
    /** When cancelled, the child process is terminated. */
    token?: CancellationLike;
}

/**
 * Supplies the environment the CLI child is spawned with. This is how the
 * extension's workspace authentication reaches the command: the CLI resolves
 * auth itself (via `MustWorkspaceClient`), so without these vars it would fall
 * back to its own default-profile resolution and could provision against a
 * different workspace than the one the extension is connected to.
 *
 * A seam rather than a direct read so the gateway keeps carrying no `vscode`
 * import and the auth wiring is assertable in tests.
 */
export type EnvFn = () => NodeJS.ProcessEnv;

/**
 * Gateway to the `databricks environments setup-local` CLI command.
 *
 * Builds the argv and drives the shared {@link runCli} process seam with
 * `--output json`, capturing stdout (the single structured
 * {@link PythonSetupResult}) and forwarding stderr (raw logs) to `onLog`. It
 * resolves with the parsed result on both success and failure exits — the
 * caller branches on `result.ok` / `result.error`, not the process exit code.
 * A cancelled run rejects with {@link PythonSetupCancelledError} so callers can
 * tell it apart from a genuine CLI failure.
 *
 * There is deliberately no live phase narration: under `--output json` the CLI
 * emits only the final JSON object on stdout (per-phase text is text-mode only,
 * and `uv sync` output is buffered), so callers show an indeterminate progress
 * indicator and read the per-phase outcomes from `result.phases` afterwards.
 */
export class PythonSetupCliClient {
    constructor(
        private readonly resolvePath: () => string,
        private readonly envFn: EnvFn,
        private readonly spawnFn?: SpawnFn,
        private readonly terminateFn?: TerminateFn
    ) {}

    async run(
        invocation: SetupLocalInvocation,
        options: RunOptions
    ): Promise<PythonSetupResult> {
        // `setup-local` mutates the project (.venv / pyproject.toml), so if the
        // request is already cancelled don't even start it — reject before
        // spawning rather than spawn-then-kill, which would let it run briefly.
        if (options.token?.isCancellationRequested) {
            throw new PythonSetupCancelledError();
        }

        const result = await runCli(
            this.resolvePath(),
            buildSetupLocalArgs(invocation),
            {
                cwd: options.cwd,
                env: this.envFn(),
                token: options.token,
                onStderr: options.onLog,
                spawnFn: this.spawnFn,
                terminateFn: this.terminateFn,
            }
        );

        if (result.cancelled) {
            throw new PythonSetupCancelledError();
        }

        try {
            return parsePythonSetupResult(result.stdout);
        } catch (e) {
            // No parseable result on stdout. Append captured stderr (uv/CLI
            // diagnostics, or an auth error printed before a result object was
            // built) so the failure is actionable, while preserving the
            // original error's type.
            const err = e as Error;
            const detail = result.stderr.trim();
            if (detail) {
                err.message = `${err.message}\n${detail}`;
            }
            throw err;
        }
    }
}
