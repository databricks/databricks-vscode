import type { Disposable } from "../../platform/event";
import { contextKey } from "../../platform/contextKeys";
import { CancelledError, errorMessage, isCancellation } from "../../platform/errors";
import type { Logger } from "../../platform/log";
import { MutableState, type State } from "../../platform/reactive";
import { CliError, type Cli } from "../cli/Cli";
import {
    bundleDeploy,
    bundleDestroy,
    bundleRun,
    bundleSyncOnce,
    MissingVariableError,
    type BundleRunOptions,
} from "../cli/commands/bundle";
import type { Connection } from "../connection/ConnectionService";
import type { VariableOverrides } from "../project/TargetFiles";
import type { BundleLog } from "./BundleLog";

/**
 * True while a bundle operation runs or waits in the queue. Commands that
 * would change what it works on are disabled meanwhile. Replaces
 * `databricks.context.bundle.deploymentState == idle`.
 */
export const BUNDLE_BUSY = contextKey<boolean>("databricks.context.bundle.busy");

/** What an operation runs against: captured when it is queued. */
export interface OperationTarget {
    readonly root: string;
    readonly target: string;
    readonly connection: Connection;
    readonly variables: VariableOverrides;
    /** `DATABRICKS_CLUSTER_ID`, while "Override Jobs cluster in bundle" is checked (COMP-06). */
    readonly clusterId?: string;
}

/** What a bundle CLI call's environment adds to the connection's, and what it is for. */
export type BundleEnvInputs = Pick<
    OperationTarget,
    "root" | "target" | "variables" | "clusterId"
> & {
    /** Aborting it cancels the command's check, as it cancels the command. */
    readonly signal?: AbortSignal;
};

/** What `BundleService` does for its operations. */
export interface OperationHost {
    /** The connected project target, if any. */
    current(): OperationTarget | undefined;
    /** Why there is none: a target the session's target guard pauses, for example. */
    unavailable?(): Error;
    /**
     * Stops starting summaries, and waits for one in flight to finish. The
     * returned function starts them again with a summary of the new state,
     * and resolves when it is done.
     */
    pauseSummaries(): Promise<() => Promise<void>>;
}

export interface BundleOperationsDeps {
    readonly host: OperationHost;
    readonly cli: Cli;
    readonly env: (
        connection: Connection,
        inputs: BundleEnvInputs,
    ) => Record<string, string> | Promise<Record<string, string>>;
    readonly log: Logger;
    readonly bundleLog: BundleLog;
}

export interface OperationOptions {
    /** `--force-lock` (and `--force` for deploy). */
    readonly force?: boolean;
    /** Aborting it kills the CLI's process group, or drops the operation if it hasn't started. */
    readonly signal?: AbortSignal;
}

export interface RunOperationOptions extends BundleRunOptions {
    /** Aborting it kills `bundle run`'s process group. */
    readonly signal?: AbortSignal;
    /** stdout and stderr as they arrive, for the run's terminal. */
    readonly onOutput?: (chunk: string) => void;
}

interface Operation {
    readonly run: (
        cli: Cli,
        target: string,
        ctx: Parameters<typeof bundleDeploy>[2],
        options: { force?: boolean },
    ) => Promise<void>;
    readonly start: (target: string) => string;
    readonly done: string;
    readonly failed: string;
    /** Whether it changes the deployed state: summaries pause while it runs, and one follows. */
    readonly deploys: boolean;
}

/** The old `runBundleCommand` lines; the e2e specs wait for `done`. */
const DEPLOY: Operation = {
    run: bundleDeploy,
    start: (target) => `Deploying the bundle for target ${target}...`,
    done: "Bundle deployed successfully.",
    failed: "Failed to deploy the bundle.",
    deploys: true,
};

const DESTROY: Operation = {
    run: bundleDestroy,
    start: (target) => `Destroying the bundle for target ${target}...`,
    done: "Bundle destroyed successfully.",
    failed: "Failed to destroy the bundle.",
    deploys: true,
};

/** The old `bundleSync` lines. It uploads files only, so the deployed state stays as it is. */
const SYNC_ONCE: Operation = {
    run: (cli, target, ctx) => bundleSyncOnce(cli, target, ctx),
    start: (target) => `Uploading bundle assets for target ${target}...`,
    done: "Bundle assets uploaded successfully.",
    failed: "Failed to upload bundle assets.",
    deploys: false,
};

/**
 * Deploy, destroy and run. Deploys and destroys on one project run
 * one at a time, in the order they were asked for, and so do the uploads
 * of `syncOnce`. While a deploy or destroy runs, `deployed` starts no
 * summaries, so the explorer keeps its last snapshot and no summary reads
 * the state the CLI is writing. When it ends, successfully or not, the deployed state is
 * refreshed, which writes "Bundle configuration refreshed.".
 *
 * Replaces the deploy mutex of the old `BundleCommands` and the deploy and
 * destroy halves of `BundleRemoteStateModel` and `CliWrapper`. Destroy now
 * shares the queue and the error handling.
 *
 * `run` doesn't join the queue: a job or pipeline run can
 * last hours, and holding the queue would block deploys and every command
 * that waits for `busy` meanwhile, as the old deploy mutex didn't either.
 */
export class BundleOperations implements Disposable {
    private readonly busyState = new MutableState(false);
    /** The tail of each project's queue. */
    private readonly queues = new Map<string, Promise<unknown>>();
    private readonly running = new Set<AbortController>();
    private pending = 0;
    private disposed = false;

    constructor(private readonly deps: BundleOperationsDeps) {}

    get busy(): State<boolean> {
        return this.busyState;
    }

    /**
     * `bundle deploy --verbose`; resolves once the deployed state is
     * refreshed, with what it deployed, so a run can follow on the same
     * target.
     */
    deploy(options: OperationOptions = {}): Promise<OperationTarget> {
        return this.enqueue(DEPLOY, options);
    }

    /**
     * `bundle sync --output text` (RUN-01): uploads the bundle's files once,
     * in the queue, so it never runs beside a deploy. Resolves with what it
     * uploaded to, so the file can run there. Throws `CliError` or
     * `CancelledError`.
     */
    syncOnce(options: Pick<OperationOptions, "signal"> = {}): Promise<OperationTarget> {
        return this.enqueue(SYNC_ONCE, options);
    }

    /** `bundle destroy --auto-approve`; resolves once the deployed state is refreshed. */
    async destroy(options: OperationOptions = {}): Promise<void> {
        await this.enqueue(DESTROY, options);
    }

    /**
     * `bundle run <resourceKey>` against `on`, usually what `deploy` just
     * deployed. It runs at once, beside the queue, and resolves when the CLI
     * exits: when the run ends, or when it is aborted. Throws
     * `MissingVariableError`, `CliError` or `CancelledError`.
     */
    async run(
        on: OperationTarget,
        resourceKey: string,
        options: RunOperationOptions = {},
    ): Promise<void> {
        if (this.disposed || options.signal?.aborted) {
            throw new CancelledError();
        }
        const controller = new AbortController();
        const signal = options.signal
            ? AbortSignal.any([options.signal, controller.signal])
            : controller.signal;
        this.running.add(controller);
        try {
            await bundleRun(
                this.deps.cli,
                on.target,
                resourceKey,
                {
                    cwd: on.root,
                    env: await this.deps.env(on.connection, { ...on, signal }),
                    signal,
                    onStdout: options.onOutput,
                    onStderr: options.onOutput,
                },
                options,
            );
        } finally {
            this.running.delete(controller);
        }
    }

    private async enqueue(
        operation: Operation,
        options: OperationOptions,
    ): Promise<OperationTarget> {
        if (this.disposed) {
            throw new CancelledError();
        }
        const target = this.deps.host.current();
        if (target === undefined) {
            throw this.deps.host.unavailable?.() ?? new Error("No bundle target is connected.");
        }
        const previous = this.queues.get(target.root) ?? Promise.resolve();
        const result = previous.then(() => this.execute(operation, target, options));
        const tail = result.catch(() => {});
        this.queues.set(target.root, tail);
        this.pending++;
        this.busyState.set(true);
        try {
            await result;
            return target;
        } finally {
            this.pending--;
            if (this.queues.get(target.root) === tail) {
                this.queues.delete(target.root);
            }
            this.busyState.set(this.pending > 0);
        }
    }

    private async execute(
        operation: Operation,
        target: OperationTarget,
        options: OperationOptions,
    ): Promise<void> {
        if (this.disposed || options.signal?.aborted) {
            throw new CancelledError();
        }
        const controller = new AbortController();
        const signal = options.signal
            ? AbortSignal.any([options.signal, controller.signal])
            : controller.signal;
        this.running.add(controller);
        const { bundleLog } = this.deps;
        const resume = operation.deploys ? await this.deps.host.pauseSummaries() : async () => {};
        try {
            bundleLog.info(operation.start(target.target));
            if (operation === DEPLOY && target.clusterId !== undefined) {
                // The old deploy's second start line.
                bundleLog.info(`DATABRICKS_CLUSTER_ID=${target.clusterId}`);
            }
            await operation.run(
                this.deps.cli,
                target.target,
                {
                    cwd: target.root,
                    env: await this.deps.env(target.connection, { ...target, signal }),
                    signal,
                    // `--verbose` writes progress to stderr, and the summary to stdout.
                    onStdout: (chunk) => bundleLog.output(chunk),
                    onStderr: (chunk) => bundleLog.output(chunk),
                },
                { force: options.force },
            );
            bundleLog.info(operation.done);
        } catch (e) {
            if (isCancellation(e)) {
                bundleLog.warn(`${operation.failed} Reason: Cancelled`);
            } else {
                // A CLI failure's output is already in the log; anything else, such as a CLI that can't start, isn't.
                const fromCli = e instanceof CliError || e instanceof MissingVariableError;
                bundleLog.error(
                    fromCli ? operation.failed : `${operation.failed} ${errorMessage(e)}`,
                );
                this.deps.log.warn(operation.failed, e);
            }
            throw e;
        } finally {
            this.running.delete(controller);
            // A failed or cancelled operation may have changed the state too.
            await resume().catch((e: unknown) =>
                this.deps.log.warn("Can't refresh the deployed state", e),
            );
        }
    }

    /** Kills the operations and runs that are running, and drops the queued ones. */
    dispose(): void {
        this.disposed = true;
        for (const controller of this.running) {
            controller.abort();
        }
        this.busyState.dispose();
    }
}
