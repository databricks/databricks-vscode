import type { Disposable, Task, TaskExecution } from "vscode";
import type { ChildCompute } from "../../kernel/cli/childEnv";
import { bundleSync, syncArgs } from "../../kernel/cli/commands/bundleSync";
import { bundleClusterOverride } from "../../kernel/compute/effectiveCompute";
import type { Connection } from "../../kernel/connection/ConnectionService";
import type { Kernel, ProjectSession } from "../../kernel/feature";
import type { Overrides } from "../../kernel/project/TargetFiles";
import { errorMessage } from "../../platform/errors";
import type { Logger } from "../../platform/log";
import type { ProcessHandle } from "../../platform/process";
import { MutableState, type State } from "../../platform/reactive";
import {
    canMove,
    isFailure,
    isRunning,
    readStderrLine,
    readStdoutLine,
    type SyncLineResult,
    type SyncStatus,
} from "./syncState";
import { syncTask, SyncTerminal } from "./SyncTerminal";

/** What the session needs from VS Code's task API. */
export interface TaskRunner {
    executeTask(task: Task): Thenable<TaskExecution>;
}

/** One sync process, from its start to its end. */
interface SyncRun {
    readonly terminal: SyncTerminal;
    readonly connection: Connection;
    /** The spawn, begun when the terminal opens: the target is checked before the process starts. */
    spawning?: Promise<void>;
    process?: ProcessHandle;
    execution?: TaskExecution;
    ended: boolean;
}

/**
 * Sync for one project session (SYNC-01, SYNC-02): at most one
 * `bundle sync --watch`, shown in the task "databricks: sync". Ported from
 * the old `CodeSynchronizer` and `SyncTasks`.
 *
 * The CLI runs on the process seam with `childEnv`, so it authenticates
 * with the connection's profile and gets the
 * variable overrides. Stopping kills its process group and terminates the
 * task this session started; it disposes no other terminal (the old
 * `SyncTask.killAll` disposed every terminal named "sync").
 */
export class SyncSession implements Disposable {
    private readonly statusState = new MutableState<SyncStatus>({ state: "STOPPED" });
    private run?: SyncRun;
    private disposed = false;

    constructor(
        private readonly session: ProjectSession & { readonly target: string },
        private readonly kernel: Kernel,
        private readonly tasks: TaskRunner,
        private readonly log: Logger,
    ) {}

    get status(): State<SyncStatus> {
        return this.statusState;
    }

    /** The connection the running sync authenticates with. */
    get connection(): Connection | undefined {
        return this.run?.ended === false ? this.run.connection : undefined;
    }

    /**
     * Starts `bundle sync --watch` (`--full` too, when asked) in a new task.
     * A sync that already runs is left alone. Resolves once the task runs;
     * the CLI starts when its terminal opens.
     */
    async start(connection: Connection, full: boolean): Promise<void> {
        if (this.disposed || (this.run !== undefined && !this.run.ended)) {
            return;
        }
        // The ended run's terminal may still be on screen; its listeners can go.
        this.run?.terminal.dispose();
        const terminal = new SyncTerminal();
        const run: SyncRun = { terminal, connection, ended: false };
        this.run = run;
        this.setStatus(run, { state: "IN_PROGRESS" });
        const subscriptions = [
            terminal.onDidOpen(() => {
                run.spawning ??= this.spawn(run, full);
            }),
            terminal.onDidCloseByUser(() => this.end(run, { state: "STOPPED" })),
        ];
        run.terminal.onDidClose(() => subscriptions.forEach((s) => s.dispose()));
        try {
            run.execution = await this.tasks.executeTask(syncTask(full, terminal));
        } catch (e) {
            this.log.error("Can't start the sync task", e);
            this.end(run, { state: "ERROR", reason: errorMessage(e) });
            throw e;
        }
        await run.spawning;
        if (run.ended) {
            run.execution.terminate();
        }
    }

    /** Stops the sync, if one runs: `STOPPED`, unless it already failed. */
    stop(): void {
        if (this.run !== undefined) {
            this.end(this.run, { state: "STOPPED" });
        }
    }

    private async spawn(run: SyncRun, full: boolean) {
        if (run.ended) {
            return;
        }
        const { kernel, session } = this;
        const args = syncArgs(session.target, { full });
        run.terminal.started(kernel.cli.cliPath, args);
        const read = (result: SyncLineResult) => {
            if (run.ended) {
                return;
            }
            if (result.text !== undefined) {
                run.terminal.writeLine(result.text);
            }
            if (result.status !== undefined) {
                if (isFailure(result.status.state)) {
                    // A failure stops the CLI, as the old synchronizer did.
                    this.end(run, result.status);
                } else {
                    this.setStatus(run, result.status);
                }
            }
        };
        try {
            const env = await kernel.bundleChildEnv({
                connection: run.connection,
                cli: true,
                bundleVariables: kernel.project.variables.value,
                ...bundleCompute(
                    kernel.project.overrides.value,
                    kernel.capabilities.compute === "perTarget",
                ),
                bundle: { root: session.project.root, target: session.target },
            });
            if (run.ended) {
                return;
            }
            run.process = bundleSync(
                kernel.cli,
                session.target,
                {
                    cwd: session.project.root,
                    env,
                    onStdoutLine: (line) => read(readStdoutLine(line)),
                    onStderrLine: (line) => read(readStderrLine(line)),
                },
                { full },
            );
        } catch (e) {
            run.terminal.writeLine(errorMessage(e));
            this.end(run, { state: "ERROR", reason: errorMessage(e) });
            return;
        }
        run.process.exited.then(
            (result) => {
                if (!result.cancelled) {
                    // `--watch` exits only when it fails; an `Error:` line may have said why.
                    this.end(
                        run,
                        result.exitCode === 0 ? { state: "STOPPED" } : { state: "ERROR" },
                        result.exitCode,
                    );
                }
            },
            (e: unknown) => {
                run.terminal.writeLine(errorMessage(e));
                this.end(run, { state: "ERROR", reason: errorMessage(e) });
            },
        );
    }

    /** Ends a run: kills its CLI, ends its task, and publishes how it ended. */
    private end(run: SyncRun, status: SyncStatus, exitCode: number | null = null) {
        this.setStatus(run, status);
        if (run.ended) {
            return;
        }
        run.ended = true;
        run.process?.kill();
        run.terminal.exit(exitCode);
        run.execution?.terminate();
    }

    /** Only the latest run publishes, and an ended one can't look running again. */
    private setStatus(run: SyncRun, status: SyncStatus) {
        if (this.run !== run || this.disposed || (run.ended && isRunning(status.state))) {
            return;
        }
        if (canMove(this.statusState.value, status)) {
            this.statusState.set(status);
        }
    }

    dispose(): void {
        this.stop();
        this.run?.terminal.dispose();
        this.disposed = true;
        this.statusState.dispose();
    }
}

/**
 * The cluster override that bundle CLI calls get (COMP-06), as `childEnv` options. A session's
 * compute is the window's, so none applies there.
 */
function bundleCompute(
    overrides: Overrides | undefined,
    choosesCompute: boolean,
): { compute?: ChildCompute } {
    const clusterId = choosesCompute ? bundleClusterOverride(overrides) : undefined;
    return clusterId === undefined ? {} : { compute: { kind: "cluster", clusterId } };
}
