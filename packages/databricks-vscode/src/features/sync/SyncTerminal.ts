import {
    CustomExecution,
    Task,
    TaskGroup,
    TaskRevealKind,
    TaskScope,
    type Disposable,
    type Event,
    type Pseudoterminal,
} from "vscode";
import { Emitter } from "../../platform/event";

/** The task type contributed in `package.json` (`taskDefinitions`). */
const TASK_TYPE = "databricks";

/** The old task names: `sync`, and `sync-full` for "Start synchronization (full sync)". */
const SYNC_TASK = { sync: "sync", syncFull: "sync-full" } as const;

/**
 * The pseudo-terminal of a sync task. It runs nothing itself: the CLI runs
 * on the process seam (as `bundle run`'s terminal), and its
 * output is written here. `onDidOpen` says when output can be shown, which
 * is when the session starts the CLI; closing the terminal, or terminating
 * the task, stops the sync.
 */
export class SyncTerminal implements Pseudoterminal, Disposable {
    private readonly written = new Emitter<string>();
    private readonly closed = new Emitter<number | void>();
    private readonly opened = new Emitter<void>();
    private readonly closedByUser = new Emitter<void>();
    readonly onDidWrite: Event<string> = this.written.event;
    readonly onDidClose: Event<number | void> = this.closed.event;
    readonly onDidOpen: Event<void> = this.opened.event;
    /** The user closed the terminal, or the task was terminated. */
    readonly onDidCloseByUser: Event<void> = this.closedByUser.event;

    open(): void {
        this.opened.fire();
    }

    close(): void {
        this.closedByUser.fire();
    }

    /** The old `[VSCODE]` header: the CLI and its arguments. */
    started(cliPath: string, args: readonly string[]): void {
        this.writeLine(`[VSCODE] databricks cli path: ${cliPath}`);
        this.writeLine(`[VSCODE] sync command args: ${args.join(",")}`);
        this.writeLine("--------------------------------------------------------");
    }

    writeLine(text: string): void {
        this.written.fire(`${text}\r\n`);
    }

    /** Ends the task, with the CLI's exit code. */
    exit(code: number | null): void {
        this.closed.fire(code ?? undefined);
    }

    dispose(): void {
        this.written.dispose();
        this.closed.dispose();
        this.opened.dispose();
        this.closedByUser.dispose();
    }
}

/**
 * The background task "databricks: sync" (or "sync-full") that shows the
 * terminal, with the old task's presentation. The old `$databricks-sync`
 * problem matcher matched Repos-era output that the CLI no longer prints,
 * and is dropped.
 */
export function syncTask(full: boolean, terminal: SyncTerminal): Task {
    const name = full ? SYNC_TASK.syncFull : SYNC_TASK.sync;
    const task = new Task(
        { type: TASK_TYPE, task: name },
        TaskScope.Workspace,
        name,
        TASK_TYPE,
        new CustomExecution(async () => terminal),
    );
    task.isBackground = true;
    task.detail = "$(rocket) Databricks sync";
    task.group = TaskGroup.Build;
    task.presentationOptions = { echo: true, reveal: TaskRevealKind.Always };
    return task;
}
