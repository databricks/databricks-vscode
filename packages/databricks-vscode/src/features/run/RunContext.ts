import type { SyncDestination } from "../../kernel/bundle/SyncDestination";
import type { ClusterDetails } from "../../kernel/compute/clusters";
import type { Compute } from "../../kernel/compute/effectiveCompute";
import type { Connection } from "../../kernel/connection/ConnectionService";
import type { Logger } from "../../platform/log";

/** The active target, as a run needs it. */
export interface RunTarget {
    /** Validate's `bundle.mode`, else the YAML's. */
    readonly mode?: string;
    /** Validate's `workspace.file_path` and the project's root. */
    readonly destination?: SyncDestination;
}

/**
 * The prompts of the old `run/prompts.ts`, with their actions. They don't
 * block: the run ends, and the action runs if the user picks it.
 */
export interface RunPrompts {
    /** "Running is disabled for non development targets. …" [Change Target Mode]. */
    changeTargetMode(mode: string | undefined): void;
    /** "Please attach a cluster" [Attach Cluster]. */
    attachCluster(): void;
    /** "The attached cluster is not running." [Start Cluster]. */
    startCluster(): void;
}

/**
 * What both runners need from the kernel and the window. `index.ts` builds
 * it from the feature's context; tests build it from fakes. It replaces the
 * old runners' `ConnectionManager`, `ConfigModel` and `BundleCommands`.
 */
export interface RunContext {
    readonly log: Logger;
    /**
     * The connection. While connecting, it calls `onWait` and waits; signed
     * out or failed, it throws "Sign in to Databricks first.".
     */
    connection(signal: AbortSignal, onWait?: () => void): Promise<Connection>;
    /** Waits for a validate in flight. */
    target(signal: AbortSignal): Promise<RunTarget>;
    /**
     * Runs `task` behind the cancellable "Uploading bundle assets"
     * notification. Its Cancel aborts the signal `task` gets, as `signal`
     * does; `report` sets the notification's message.
     */
    progress<T>(
        signal: AbortSignal,
        task: (signal: AbortSignal, report: (message: string) => void) => Promise<T>,
    ): Promise<T>;
    /** `BundleOperations.syncOnce`, with the bundle log shown. Throws `CancelledError` when `signal` aborts it. */
    upload(signal: AbortSignal): Promise<void>;
    /** Shows the debug console again: the upload reveals the bundle log over it. */
    focusDebugConsole(): Promise<void>;
    compute(): Compute | undefined;
    getCluster(clusterId: string, signal: AbortSignal): Promise<ClusterDetails>;
    readonly prompts: RunPrompts;
    /** A file under the extension's `resources/python/`. */
    readResource(name: string): Promise<string>;
    /** `databricks.wsfs.rearrangeCells`. */
    rearrangeCells(): boolean;
    /** Shows an error notification: the debug sessions aren't commands, so the registry doesn't render theirs. */
    showError(message: string): void;
}
