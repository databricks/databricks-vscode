import { Cli } from "../kernel/cli/Cli";
import { Log } from "../platform/log";
import type {
    ProcessHandle,
    ProcessRunner,
    RunOptions,
    RunResult,
    StartOptions,
} from "../platform/process";

type Response =
    | Partial<RunResult>
    | ((args: string[], options: RunOptions) => Partial<RunResult> | Promise<Partial<RunResult>>);

export interface RecordedCall {
    readonly command: string;
    readonly args: string[];
    readonly options: RunOptions;
}

/**
 * A `ProcessRunner` with scripted results, matched by argument prefix. The
 * newest matching script wins; unmatched calls exit 0 with no output.
 */
export class FakeProcessRunner implements ProcessRunner {
    readonly calls: RecordedCall[] = [];
    private readonly scripts: { prefix: string[]; response: Response }[] = [];

    on(prefix: string[], response: Response): this {
        this.scripts.unshift({ prefix, response });
        return this;
    }

    async run(command: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
        this.calls.push({ command, args, options });
        const script = this.scripts.find((s) => s.prefix.every((p, i) => args[i] === p));
        const response =
            typeof script?.response === "function"
                ? await script.response(args, options)
                : script?.response;
        return { stdout: "", stderr: "", exitCode: 0, cancelled: false, ...response };
    }

    /** Long-running processes, newest last. Tests drive their output and exit. */
    readonly started: FakeProcess[] = [];

    start(command: string, args: string[], options: StartOptions = {}): ProcessHandle {
        const process = new FakeProcess(command, args, options);
        this.started.push(process);
        return process;
    }

    /** The argument lists of every call, for assertions. */
    get argv(): string[][] {
        return this.calls.map((c) => c.args);
    }
}

/** A process started by `FakeProcessRunner.start`. Aborting its signal kills it, as the real seam does. */
export class FakeProcess implements ProcessHandle {
    readonly pid = 4242;
    killed = false;
    readonly exited: Promise<RunResult>;
    private settle!: (result: RunResult) => void;
    private reject!: (error: Error) => void;
    private done = false;

    constructor(
        readonly command: string,
        readonly args: string[],
        readonly options: StartOptions,
    ) {
        this.exited = new Promise((resolve, reject) => {
            this.settle = resolve;
            this.reject = reject;
        });
        options.signal?.addEventListener("abort", () => this.kill(), { once: true });
    }

    stdout(...lines: string[]): this {
        lines.forEach((line) => this.options.onStdoutLine?.(line));
        return this;
    }

    stderr(...lines: string[]): this {
        lines.forEach((line) => this.options.onStderrLine?.(line));
        return this;
    }

    /** The process exits by itself. */
    exit(exitCode: number): void {
        this.finish({ stdout: "", stderr: "", exitCode, cancelled: false });
    }

    kill(): void {
        this.killed = true;
        this.finish({ stdout: "", stderr: "", exitCode: null, cancelled: true });
    }

    /** The process couldn't start, as a spawn error (ENOENT) says. */
    fail(error: Error): void {
        if (!this.done) {
            this.done = true;
            this.reject(error);
        }
    }

    private finish(result: RunResult) {
        if (!this.done) {
            this.done = true;
            this.settle(result);
        }
    }
}

/** A `Cli` over a `FakeProcessRunner`; `overridden` says the path is the override setting's. */
export function fakeCli(
    runner = new FakeProcessRunner(),
    cliPath = "/ext/bin/databricks",
    overridden = false,
) {
    return {
        cli: new Cli(
            runner,
            () => cliPath,
            new Log([], "Test"),
            () => overridden,
        ),
        runner,
    };
}
