import {CancellationTokenSource, Disposable, Event, EventEmitter} from "vscode";
import {CancellationLike} from "../gateways/PythonSetupCliClient";
import {PythonSetupDrift} from "../../telemetry/pythonSetupExtensions";
import {PythonSetupDriftTrigger} from "../../telemetry/constants";
import {isDrifted} from "../utils/driftDetection";

export interface PythonSetupDriftDeps {
    isVisible: () => Promise<boolean>;
    getPersistedEnvKey: () => string | undefined;
    /**
     * Cheap, synchronous identity of the selected compute (e.g.
     * `"cluster:<id>:<sparkVersion>"`, `"serverless:v5"`), or `undefined` when
     * nothing comparable is attached. Never spawns the CLI. Used to skip the
     * dry-run on a no-op compute change and to clear drift when detached.
     */
    getComputeDescriptor: () => string | undefined;
    resolveCurrentEnvKey: (
        token: CancellationLike
    ) => Promise<string | undefined>;
    recordDrift: (report: PythonSetupDrift) => void;
}

/**
 * The config-view row's derived state:
 *  - `unset`   — no setup on record (initial CTA);
 *  - `ready`   — a setup is on record and matches (or drift can't be assessed);
 *  - `drifted` — a setup is on record but the selected compute no longer matches.
 */
export type PythonSetupDriftState = "unset" | "ready" | "drifted";

/**
 * Watches for compute drift: when the selected compute's env key no longer
 * matches the last successful setup's, exposes a {@link PythonSetupDriftState}
 * the config-view row renders as an "out of date — re-run setup" affordance.
 *
 * Deliberately passive and fail-safe: a silent CLI `--dry-run` (no UI), gated by
 * `isVisible` and a persisted state, debounced against rapid switches, and any
 * inability to resolve the current key is treated as "unknown" — never a false
 * alarm.
 */
export class PythonSetupDriftManager implements Disposable {
    private _drifted = false;
    /** `${from}->${to}` of the last reported mismatch, to dedupe telemetry. */
    private lastReported: string | undefined;
    /** Compute descriptor evaluated last, to skip no-op compute-change checks. */
    private lastComputeDescriptor: string | undefined;
    private generation = 0;
    private disposed = false;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;
    private inFlight: CancellationTokenSource | undefined;

    private readonly stateEmitter = new EventEmitter<void>();
    readonly onDidChangeState: Event<void> = this.stateEmitter.event;

    constructor(
        private readonly deps: PythonSetupDriftDeps,
        private readonly debounceMs: number = 500
    ) {}

    /**
     * The row's derived state, read live so it survives a window reload: with a
     * setup on record the row stays `ready`/`drifted`; with none it is `unset`.
     */
    get state(): PythonSetupDriftState {
        if (this.deps.getPersistedEnvKey() === undefined) {
            return "unset";
        }
        return this._drifted ? "drifted" : "ready";
    }

    /** Debounced entry point for triggers (compute change, open, setup done). */
    check(trigger: PythonSetupDriftTrigger): void {
        if (this.debounceTimer !== undefined) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = undefined;
            void this.evaluate(trigger);
        }, this.debounceMs);
    }

    /**
     * The awaitable core. Public so it is unit-testable directly; production
     * code reaches it through the debounced {@link check}.
     */
    async evaluate(trigger: PythonSetupDriftTrigger): Promise<void> {
        const myGeneration = ++this.generation;

        // Cancel any dry-run still running for a superseded trigger.
        this.inFlight?.cancel();
        this.inFlight?.dispose();
        const source = new CancellationTokenSource();
        this.inFlight = source;

        try {
            const visible = await this.deps.isVisible();

            // A newer trigger (or disposal) superseded us: drop this stale result.
            if (myGeneration !== this.generation) {
                return;
            }
            if (!visible) {
                this.setDrifted(false);
                return;
            }
            const persisted = this.deps.getPersistedEnvKey();
            if (persisted === undefined) {
                this.setDrifted(false);
                return;
            }
            const descriptor = this.deps.getComputeDescriptor();
            // Nothing comparable attached (detached, or serverless with no chosen
            // version): drift is meaningless, so clear any stale flag.
            if (descriptor === undefined) {
                this.lastComputeDescriptor = undefined;
                this.setDrifted(false);
                return;
            }
            // A compute-change whose identity is unchanged is a runtime-state
            // transition (e.g. RUNNING -> TERMINATED), not a switch; the env key
            // can't have changed, so skip the dry-run. open/setupCompleted always
            // re-evaluate.
            if (
                trigger === "computeChange" &&
                descriptor === this.lastComputeDescriptor
            ) {
                return;
            }
            const current = await this.deps.resolveCurrentEnvKey(source.token);

            // A newer trigger (or disposal) superseded us: drop this stale result.
            if (myGeneration !== this.generation) {
                return;
            }
            // Unknown current key: leave the flag as-is (a transient failure must
            // not retract a real warning) and do NOT record the descriptor, or the
            // no-op skip above would latch this compute and never retry.
            if (current === undefined) {
                return;
            }
            // Compute may have switched during the dry-run without bumping our
            // generation (its debounce hasn't fired yet); drop the now-stale
            // result and let the pending trigger re-evaluate.
            if (this.deps.getComputeDescriptor() !== descriptor) {
                return;
            }
            // Definitive result: record the descriptor so a later no-op
            // compute-change with the same identity is skipped.
            this.lastComputeDescriptor = descriptor;

            const drifted = isDrifted(persisted, current);
            this.setDrifted(drifted);

            if (drifted) {
                const mismatch = `${persisted}->${current}`;
                if (this.lastReported !== mismatch) {
                    this.lastReported = mismatch;
                    this.deps.recordDrift({
                        trigger,
                        fromEnvKey: persisted,
                        toEnvKey: current,
                    });
                }
            }
        } catch {
            // Any failure (isVisible or the dry-run rejecting) is "unknown": stay
            // silent and leave the flag untouched — never a false alarm, never
            // retract a real warning.
        } finally {
            if (this.inFlight === source) {
                source.dispose();
                this.inFlight = undefined;
            }
        }
    }

    private setDrifted(value: boolean): void {
        if (this.disposed) {
            return;
        }
        if (!value) {
            // Reset the telemetry dedupe latch so a recurrence is reported again.
            this.lastReported = undefined;
        }
        if (value === this._drifted) {
            return;
        }
        this._drifted = value;
        this.stateEmitter.fire();
    }

    dispose(): void {
        this.disposed = true;
        // Invalidate any in-flight evaluation so it can't mutate state or record
        // telemetry after disposal.
        this.generation++;
        if (this.debounceTimer !== undefined) {
            clearTimeout(this.debounceTimer);
        }
        this.inFlight?.cancel();
        this.inFlight?.dispose();
        this.stateEmitter.dispose();
    }
}
