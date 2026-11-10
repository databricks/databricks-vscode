import fs from "node:fs";
import type { Logger } from "../../platform/log";
import type { ProcessHandle, ProcessRunner, RunResult } from "../../platform/process";
import { CancelledError, UserFacingError } from "../../platform/errors";

/**
 * The immutable context of one CLI call. There are no
 * setters: every call says where it runs and with which environment, which
 * comes from `childEnv`.
 */
export interface CliCallContext {
    readonly env: Record<string, string>;
    readonly cwd?: string;
    readonly signal?: AbortSignal;
    /** stdout as it arrives, for commands whose output is a log rather than a result. */
    readonly onStdout?: (chunk: string) => void;
    /** stderr as it arrives, for logs the user reads while the command runs. */
    readonly onStderr?: (chunk: string) => void;
}

/** The context of a long-running CLI process: its output arrives line by line. */
export interface CliStartContext {
    readonly env: Record<string, string>;
    readonly cwd?: string;
    /** Aborting it kills the process group, like `ProcessHandle.kill()`. */
    readonly signal?: AbortSignal;
    readonly onStdoutLine?: (line: string) => void;
    readonly onStderrLine?: (line: string) => void;
}

/** The CLI exited with a non-zero code. */
export class CliError extends Error {
    constructor(
        readonly args: readonly string[],
        readonly exitCode: number | null,
        readonly stderr: string,
        readonly stdout: string,
    ) {
        super(
            stderr.trim() ||
                stdout.trim() ||
                `databricks ${args[0] ?? ""} exited with code ${exitCode}`,
        );
        this.name = "CliError";
    }
}

/**
 * The error for a CLI that can't start. A missing file makes the spawn fail
 * with ENOENT, and so does a missing working directory, with the same path,
 * so the file is checked before the message says the CLI wasn't found. Any
 * other error is returned as it is.
 */
function spawnError(error: unknown, command: string, overridden: boolean): unknown {
    if (
        !(error instanceof Error) ||
        (error as NodeJS.ErrnoException).code !== "ENOENT" ||
        fs.existsSync(command)
    ) {
        return error;
    }
    const fix = overridden
        ? "Fix the path in databricks.overrideDatabricksCLIPath."
        : "Reinstall the extension.";
    return new UserFacingError(
        "CLI_NOT_FOUND",
        `The Databricks CLI wasn't found at ${command}. ${fix}`,
        { cause: error },
    );
}

/**
 * The gateway to the Databricks CLI. Typed commands in `commands/` build the
 * arguments and parse the output; this class runs them. It shows no UI.
 */
export class Cli {
    constructor(
        private readonly runner: ProcessRunner,
        private readonly path: () => string,
        private readonly log: Logger,
        /** Whether `path` is the override setting's, rather than the bundled CLI. */
        private readonly overridden: () => boolean = () => false,
    ) {}

    get cliPath(): string {
        return this.path();
    }

    /** Runs a command. Throws `CliError` on a non-zero exit, `CancelledError` when aborted. */
    async exec(
        args: readonly string[],
        ctx: CliCallContext,
        options: { input?: string } = {},
    ): Promise<RunResult> {
        const command = this.path();
        // Never log stdin: `configure` reads a token from it.
        this.log.debug(`Running databricks ${args.join(" ")}`);
        let result: RunResult;
        try {
            result = await this.runner.run(command, [...args], {
                cwd: ctx.cwd,
                env: ctx.env,
                signal: ctx.signal,
                input: options.input,
                closeStdin: true,
                onStdout: ctx.onStdout,
                onStderr: ctx.onStderr,
            });
        } catch (e) {
            throw spawnError(e, command, this.overridden());
        }
        if (result.cancelled) {
            throw new CancelledError();
        }
        if (result.exitCode !== 0) {
            throw new CliError(args, result.exitCode, result.stderr, result.stdout);
        }
        return result;
    }

    /**
     * Starts a long-running command, such as `bundle sync --watch`. Its exit
     * is the caller's to interpret: `exited` resolves with the code, or
     * `cancelled` once it was killed.
     */
    start(args: readonly string[], ctx: CliStartContext): ProcessHandle {
        this.log.debug(`Starting databricks ${args.join(" ")}`);
        const command = this.path();
        const handle = this.runner.start(command, [...args], {
            cwd: ctx.cwd,
            env: ctx.env,
            signal: ctx.signal,
            closeStdin: true,
            onStdoutLine: ctx.onStdoutLine,
            onStderrLine: ctx.onStderrLine,
        });
        // A spawn failure settles `exited` with its error, as it does for `exec`.
        return {
            get pid() {
                return handle.pid;
            },
            exited: handle.exited.catch((e: unknown) => {
                throw spawnError(e, command, this.overridden());
            }),
            kill: () => handle.kill(),
        };
    }
}
