import type { Disposable, Event } from "vscode";
import { isCancellation } from "../../../platform/errors";
import { Emitter } from "../../../platform/event";
import type { Logger } from "../../../platform/log";
import { LineBuffer } from "../../../platform/process";
import type { TrackerState } from "./runState";

export interface TrackerOptions {
    readonly log: Logger;
    /** Between two status reads. */
    readonly pollMs?: number;
    /** How long to wait for the run's ID before giving up. */
    readonly idTimeoutMs?: number;
    /** Consecutive failed reads after which the status is given up as unknown. */
    readonly maxFailedPolls?: number;
}

const ID_TIMEOUT_MS = 60_000;
const MAX_FAILED_POLLS = 5;

/**
 * Follows one `bundle run` of a job or a pipeline (the old `BundleRunStatus`).
 * It reads the run's ID from the CLI's output, then polls the run's status
 * until the run ends, the run is cancelled, or the tracker is disposed with
 * its project session. Every change fires `onDidChange`; the explorer's run
 * rows read `state`, `runId` and `data`.
 */
export abstract class RunTracker<D> implements Disposable {
    abstract readonly type: "jobs" | "pipelines";
    runId?: string;
    data?: D;

    private current: TrackerState = "unknown";
    private readonly changed = new Emitter<void>();
    readonly onDidChange: Event<void> = this.changed.event;
    private readonly lines = new LineBuffer((line) => this.onLine(line));
    private readonly controller = new AbortController();
    private readonly idTimer: ReturnType<typeof setTimeout>;
    private wake?: () => void;
    /** Set by a wake-up that came while a poll was in flight: the next wait is skipped. */
    private woken = false;
    private polling?: Promise<void>;
    private disposed = false;

    constructor(protected readonly options: TrackerOptions) {
        this.idTimer = setTimeout(() => {
            if (this.current === "unknown") {
                this.state = "timeout";
            }
        }, options.idTimeoutMs ?? ID_TIMEOUT_MS);
    }

    get state(): TrackerState {
        return this.current;
    }

    protected set state(value: TrackerState) {
        if (this.disposed) {
            return;
        }
        this.current = value;
        this.changed.fire();
    }

    /** Waiting for its ID, or polling a run that hasn't ended. */
    get isRunning(): boolean {
        return this.current === "unknown" || this.current === "running";
    }

    /** The run's ID as it appears in the output, or undefined. */
    protected abstract parseId(line: string): string | undefined;

    /** Reads the run's status into `data`. True once the run has ended. */
    protected abstract poll(signal: AbortSignal): Promise<boolean>;

    /** Stops the remote run, if it is still running. */
    protected abstract stop(signal: AbortSignal): Promise<void>;

    /** The CLI's output, as it arrives. */
    write(chunk: string): void {
        this.lines.write(chunk);
    }

    private onLine(line: string) {
        if (this.runId !== undefined || this.current !== "unknown") {
            return;
        }
        const id = this.parseId(line);
        if (id === undefined) {
            return;
        }
        clearTimeout(this.idTimer);
        this.runId = id;
        this.state = "running";
        this.polling = this.pollUntilDone();
    }

    protected fireChanged(): void {
        if (!this.disposed) {
            this.changed.fire();
        }
    }

    private async pollUntilDone(): Promise<void> {
        const signal = this.controller.signal;
        let failures = 0;
        while (!signal.aborted && this.current === "running") {
            try {
                if (await this.poll(signal)) {
                    if (this.current === "running") {
                        this.state = "completed";
                    }
                    return;
                }
                failures = 0;
            } catch (e) {
                if (signal.aborted || isCancellation(e)) {
                    return;
                }
                failures++;
                this.options.log.warn(`Failed to check the run status (${failures})`, e);
                if (failures >= (this.options.maxFailedPolls ?? MAX_FAILED_POLLS)) {
                    this.state = "error";
                    return;
                }
            }
            if (this.woken) {
                this.woken = false;
                continue;
            }
            await new Promise<void>((resolve) => {
                const timer = setTimeout(resolve, this.options.pollMs ?? 5000);
                this.wake = () => {
                    clearTimeout(timer);
                    resolve();
                };
            });
            this.wake = undefined;
        }
    }

    /** Polls now rather than at the next interval. */
    private pollNow() {
        if (this.wake !== undefined) {
            this.wake();
        } else {
            this.woken = true;
        }
    }

    /**
     * The CLI exited. On success the run has ended, so the status is read at
     * once rather than at the next poll. On failure a run that started is
     * read once more and stopped if it still runs; one that never started
     * is an error.
     */
    async cliExited(success: boolean): Promise<void> {
        this.lines.end();
        clearTimeout(this.idTimer);
        if (this.runId === undefined) {
            if (this.isRunning) {
                this.state = success ? "completed" : "error";
            }
            return;
        }
        if (success) {
            this.pollNow();
            await this.polling;
            return;
        }
        if (this.current !== "running") {
            return;
        }
        // Whether the last read worked: if it didn't, an earlier status may be stale.
        let read = false;
        try {
            if (!(await this.poll(this.controller.signal))) {
                await this.cancel();
                return;
            }
            read = true;
        } catch (e) {
            this.options.log.warn("Failed to check the run status after the CLI failed", e);
        }
        if (this.current === "running") {
            this.state = read && this.data !== undefined ? "completed" : "error";
        }
    }

    /**
     * Cancels the remote run: after the user cancels, the CLI is killed, and
     * the run it started would otherwise go on. Before the run has an ID
     * there is nothing to stop.
     */
    async cancel(): Promise<void> {
        clearTimeout(this.idTimer);
        if (this.runId === undefined || this.current !== "running") {
            if (this.current !== "completed" && this.current !== "error") {
                this.state = "cancelled";
            }
            return;
        }
        this.state = "cancelling";
        const signal = this.controller.signal;
        try {
            await this.stop(signal);
            await this.poll(signal);
            this.state = "cancelled";
        } catch (e) {
            if (signal.aborted) {
                return;
            }
            this.state = "error";
            throw e;
        }
    }

    dispose(): void {
        this.disposed = true;
        clearTimeout(this.idTimer);
        this.controller.abort();
        this.pollNow();
        this.changed.dispose();
    }
}
